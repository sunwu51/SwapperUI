import { Tabs, TabsItem, Badge, Input, Button, Tooltip, Select } from '@sunwu51/camel-ui';
import Watch from './tabs/Watch';
import ChangeBody from './tabs/ChangeBody';
import Execute from './tabs/Execute';
import ReplaceClass from './tabs/ReplaceClass';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LogContent from './logs/LogContent';
import toast, { Toaster } from 'react-hot-toast';
import DebugWorkspace from './debug/DebugWorkspace';
import { ReadyState, WebSocketContext } from './webSocketContext';

export default function Layout() {
    const defaultUrl = defaultApiBaseUrl();
    const [apiBaseUrl, setApiBaseUrl] = useState(defaultUrl);
    const [urlInput, setUrlInput] = useState(defaultUrl);
    const [lastMessage, setLastMessage] = useState(null);
    const [readyState, setReadyState] = useState(ReadyState.CONNECTING);
    const [classLoaders, setClassLoaders] = useState([]);
    const [classLoaderHash, setClassLoaderHash] = useState('');
    const [workspace, setWorkspace] = useState('tools');
    const workspaceTabRefs = useRef([]);

    useEffect(() => {
        document.title = 'swapper';
    }, []);

    useEffect(() => {
        setReadyState(ReadyState.CONNECTING);
        const eventSource = new EventSource(normalizeBaseUrl(apiBaseUrl) + '/log');
        eventSource.onopen = () => setReadyState(ReadyState.OPEN);
        eventSource.onerror = () => setReadyState(eventSource.readyState === EventSource.CLOSED ? ReadyState.CLOSED : ReadyState.CONNECTING);
        eventSource.onmessage = (event) => {
            const message = { data: event.data, timestamp: Date.now() };
            setLastMessage(message);
            window.dispatchEvent(new CustomEvent('swapper-log-message', { detail: message }));
        };
        return () => {
            setReadyState(ReadyState.CLOSING);
            eventSource.close();
            setReadyState(ReadyState.CLOSED);
        };
    }, [apiBaseUrl]);

    const refreshClassLoaders = useCallback(async () => {
        const requestId = genRequestId();
        try {
            const response = await fetch(normalizeBaseUrl(apiBaseUrl) + '/mcp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: requestId,
                    method: 'tools/call',
                    params: { name: 'list_classloaders', arguments: {} },
                }),
            });
            if (!response.ok) {
                throw new Error(`request failed: ${response.status}`);
            }
            const json = await response.json();
            const result = json?.result?.structuredContent;
            if (!result?.success) {
                throw new Error(result?.message || 'failed to list ClassLoaders');
            }
            const loaders = Array.isArray(result.data) ? result.data : [];
            setClassLoaders(loaders);
            setClassLoaderHash(current => loaders.some(loader => loader.classLoaderHash === current) ? current : '');
        } catch (e) {
            setClassLoaders([]);
            setClassLoaderHash('');
            toast(e.message || 'failed to list ClassLoaders');
        }
    }, [apiBaseUrl]);

    useEffect(() => {
        if (readyState === ReadyState.OPEN) {
            refreshClassLoaders();
        }
    }, [readyState, refreshClassLoaders]);

    const callTool = useCallback(async (toolName, args = {}) => {
        const requestId = genRequestId();
        try {
            const response = await fetch(normalizeBaseUrl(apiBaseUrl) + '/mcp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: requestId,
                    method: 'tools/call',
                    params: { name: toolName, arguments: args },
                }),
            });
            if (!response.ok) {
                throw new Error(await response.text() || `request failed: ${response.status}`);
            }
            const json = await response.json();
            const content = json?.result?.structuredContent;
            if (json.error) {
                throw new Error(json.error.message || 'mcp error');
            }
            if (content && !content.success) {
                throw new Error(content.message || 'tool failed');
            }
            return content;
        } catch (error) {
            toast(error.message || 'request failed');
            return null;
        }
    }, [apiBaseUrl]);

    const sendMessage = useMemo(() => {
        return async (message) => {
            let payload;
            try {
                payload = typeof message === 'string' ? JSON.parse(message) : message;
            } catch (e) {
                toast('request json invalid');
                return null;
            }

            const requestId = payload.logId || payload.id || genRequestId();
            const argumentsPayload = { ...payload, logId: requestId };
            delete argumentsPayload.id;
            const toolName = messageTypeToToolName(payload.type);
            if (!toolName) {
                toast(`unsupported message type: ${payload.type}`);
                return null;
            }
            if (CLASS_TARGET_MESSAGE_TYPES.has(payload.type)) {
                if (classLoaderHash) {
                    argumentsPayload.classLoaderHash = classLoaderHash;
                } else {
                    delete argumentsPayload.classLoaderHash;
                }
            }

            try {
                const response = await fetch(normalizeBaseUrl(apiBaseUrl) + '/mcp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: requestId,
                        method: 'tools/call',
                        params: {
                            name: toolName,
                            arguments: argumentsPayload,
                        },
                    }),
                });
                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(text || `request failed: ${response.status}`);
                }
                const json = await response.json();
                const structuredContent = json?.result?.structuredContent;
                window.dispatchEvent(new CustomEvent('swapper-mcp-response', {
                    detail: { requestId, toolName, payload: argumentsPayload, json, structuredContent }
                }));
                if (json.error) {
                    toast(json.error.message || 'mcp error');
                } else if (structuredContent && !structuredContent.success) {
                    toast(structuredContent.message || 'tool failed');
                }
                return json;
            } catch (e) {
                toast(e.message || 'request failed');
                return null;
            }
        };
    }, [apiBaseUrl, classLoaderHash]);

    const classLoaderOptions = useMemo(() => [
        'ignore (auto-detect)',
        ...classLoaders.map(loader => `${loader.classLoaderName} [${loader.classLoaderHash}] (${loader.classCount} classes)`),
    ], [classLoaders]);
    const classLoaderDefaultIndex = Math.max(0,
        classLoaders.findIndex(loader => loader.classLoaderHash === classLoaderHash) + 1);

    const connectionStatus = {
        [ReadyState.CONNECTING]: 'Connecting',
        [ReadyState.OPEN]: 'Connected',
        [ReadyState.CLOSING]: 'Closing',
        [ReadyState.CLOSED]: 'Closed',
        [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
    }[readyState];
    const color = {
        [ReadyState.CONNECTING]: 'var(--w-blue-dark)',
        [ReadyState.OPEN]: 'var(--w-green-dark)',
        [ReadyState.CLOSING]: 'var(--w-red)',
        [ReadyState.CLOSED]: 'var(--w-red-dark)',
        [ReadyState.UNINSTANTIATED]: 'var(--w-yello-dark)',
    }[readyState];

    const handleWorkspaceKeyDown = (event, index) => {
        const lastIndex = workspaceTabRefs.current.length - 1;
        let nextIndex = index;
        if (event.key === 'ArrowRight') nextIndex = index === lastIndex ? 0 : index + 1;
        else if (event.key === 'ArrowLeft') nextIndex = index === 0 ? lastIndex : index - 1;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = lastIndex;
        else return;
        event.preventDefault();
        setWorkspace(nextIndex === 0 ? 'tools' : 'debug');
        workspaceTabRefs.current[nextIndex]?.focus();
    };

    return <div>
        <div><Toaster toastOptions={{
            style: {
                boxShadow: 'var(--w-box-shadow)',
                border: '1px solid var(--w-black)',
                fontWeight: 'bold',
                color: 'var(--w-black)',
                backgroundColor: "var(--w-orange)",
                minWidth: 'min(320px, calc(100vw - 32px))',
                maxWidth: 'min(640px, calc(100vw - 32px))',
                whiteSpace: 'pre-line',
                overflowWrap: 'anywhere',
                lineHeight: 1.45,
            },
        }} /></div>
        <div>
            <div className='m-2 flex items-end gap-3'>
                <div>
                    <Input value={urlInput} className='w-[550px]' defaultValue={defaultUrl} onChange={setUrlInput} aria-label='urlInput'></Input>
                </div>
                <div>
                    <Button onPress={() => {
                        if (urlInput.startsWith("http://") || urlInput.startsWith("https://"))
                            setApiBaseUrl(urlInput)
                        else
                            toast("http url error")
                    }}>Connect</Button>
                </div>
                <div>http status: <Tooltip overlay={<span>{apiBaseUrl}</span>}><Badge style={{ backgroundColor: color }}>{connectionStatus}</Badge></Tooltip></div>
            </div>
            <WebSocketContext.Provider value={{
                sendMessage,
                callTool,
                lastMessage,
                readyState,
            }}>
                {workspace === 'tools' && <div className='mx-2 flex items-end gap-3'>
                    <div>
                        <div className='mb-1 text-sm font-semibold'>ClassLoader for class-target operations</div>
                        <Select key={classLoaderOptions.join('|')} items={classLoaderOptions}
                            className='w-[650px]' defaultIndex={classLoaderDefaultIndex}
                            onSelectedItemChange={(event) => {
                                const index = classLoaderOptions.indexOf(event.selectedItem);
                                setClassLoaderHash(index <= 0 ? '' : classLoaders[index - 1].classLoaderHash);
                            }}>
                        </Select>
                    </div>
                    <Button onPress={refreshClassLoaders}>Refresh ClassLoaders</Button>
                </div>}
                <div className='mx-2 mt-3 flex gap-1 border-b border-slate-300'
                    role='tablist' aria-label='Workspace'>
                    <button id='workspace-tab-tools' role='tab'
                        ref={node => { workspaceTabRefs.current[0] = node; }}
                        aria-controls='workspace-panel-tools'
                        aria-selected={workspace === 'tools'}
                        tabIndex={workspace === 'tools' ? 0 : -1}
                        className={`border-0 border-b-2 px-3 py-2 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${workspace === 'tools'
                            ? 'border-blue-700 text-blue-800'
                            : 'border-transparent text-slate-500 hover:text-blue-800'}`}
                        onKeyDown={event => handleWorkspaceKeyDown(event, 0)}
                        onClick={() => setWorkspace('tools')}>Tools</button>
                    <button id='workspace-tab-debug' role='tab'
                        ref={node => { workspaceTabRefs.current[1] = node; }}
                        aria-controls='workspace-panel-debug'
                        aria-selected={workspace === 'debug'}
                        tabIndex={workspace === 'debug' ? 0 : -1}
                        className={`border-0 border-b-2 px-3 py-2 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${workspace === 'debug'
                            ? 'border-blue-700 text-blue-800'
                            : 'border-transparent text-slate-500 hover:text-blue-800'}`}
                        onKeyDown={event => handleWorkspaceKeyDown(event, 1)}
                        onClick={() => setWorkspace('debug')}>Online Debug</button>
                </div>
                {workspace === 'tools' ? <div id='workspace-panel-tools'
                    role='tabpanel' aria-labelledby='workspace-tab-tools'
                    className='flex flex-row p-2'>
                    <div>
                        <Tabs className='min-w-[700px] max-w-[800px] w-[50vw]' tabPanelClassName='min-h-[84vh]'>
                            <TabsItem title='Watch'>
                                <Watch />
                            </TabsItem>
                            <TabsItem title='Change'>
                                <ChangeBody />
                            </TabsItem>
                            <TabsItem title='Exec'>
                                <Execute />
                            </TabsItem>
                            <TabsItem title='Rep/Dec'>
                                <ReplaceClass />
                            </TabsItem>
                        </Tabs>
                    </div>
                    <div className='flex-1 min-w-[700px]'>
                        <LogContent />
                    </div>
                    </div> : <div id='workspace-panel-debug'
                    role='tabpanel' aria-labelledby='workspace-tab-debug'>
                    <DebugWorkspace visible={workspace === 'debug'} />
                </div>}
            </WebSocketContext.Provider>
        </div>

    </div>
}

const CLASS_TARGET_MESSAGE_TYPES = new Set([
    'WATCH',
    'OUTER_WATCH',
    'TRACE',
    'CHANGE_BODY',
    'CHANGE_RESULT',
    'REPLACE_CLASS',
    'DECOMPILE',
]);

function normalizeBaseUrl(url) {
    return url.endsWith('/') ? url.slice(0, -1) : url;
}

function defaultApiBaseUrl() {
    if (window.location.port === '5173') {
        return `${window.location.protocol}//${window.location.hostname}:8000`;
    }
    return window.location.origin;
}

function messageTypeToToolName(type) {
    const mapping = {
        WATCH: 'watch',
        OUTER_WATCH: 'outer_watch',
        TRACE: 'trace',
        CHANGE_BODY: 'change_body',
        CHANGE_RESULT: 'change_result',
        REPLACE_CLASS: 'replace_class',
        DECOMPILE: 'decompile',
        FIND_SUBCLASSES: 'find_subclasses',
        EXEC: 'exec',
        EVAL: 'eval',
        DELETE: 'delete_transformer',
        RESET: 'reset',
        PING: 'list_transformers',
    };
    return mapping[type];
}

function genRequestId() {
    return 'ui-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}
