import { Tabs, TabsItem, Badge, Input, Button, Tooltip } from '@sunwu51/camel-ui';
import Watch from './tabs/Watch';
import ChangeBody from './tabs/ChangeBody';
import Execute from './tabs/Execute';
import ReplaceClass from './tabs/ReplaceClass';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import LogContent from './logs/LogContent';
import toast, { Toaster } from 'react-hot-toast';

export const ReadyState = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
    UNINSTANTIATED: -1,
};

const WebSocketContext = createContext(null);

export const useWebSocketContext = () => {
    return useContext(WebSocketContext);
};

export default function Layout() {
    const defaultUrl = defaultApiBaseUrl();
    const [apiBaseUrl, setApiBaseUrl] = useState(defaultUrl);
    const [urlInput, setUrlInput] = useState(defaultUrl);
    const [lastMessage, setLastMessage] = useState(null);
    const [readyState, setReadyState] = useState(ReadyState.CONNECTING);

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
            const { id: ignoredId, ...payloadWithoutJsonRpcId } = payload;
            const argumentsPayload = { ...payloadWithoutJsonRpcId, logId: requestId };
            const toolName = messageTypeToToolName(payload.type);
            if (!toolName) {
                toast(`unsupported message type: ${payload.type}`);
                return null;
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
    }, [apiBaseUrl]);

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

    return <div>
        <div><Toaster toastOptions={{
            style: {
                boxShadow: 'var(--w-box-shadow)',
                border: '1px solid var(--w-black)',
                fontWeight: 'bold',
                color: 'var(--w-black)',
                backgroundColor: "var(--w-orange)",
                minWidth: '300px'
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
                lastMessage,
                readyState,
            }}>
                <div className='flex flex-row p-2'>
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
                </div>
            </WebSocketContext.Provider>
        </div>

    </div>
}

function normalizeBaseUrl(url) {
    return url.endsWith('/') ? url.slice(0, -1) : url;
}

function defaultApiBaseUrl() {
    if (window.location.port && window.location.port !== '8000') {
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
