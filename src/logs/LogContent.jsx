import { useEffect, useRef, useState } from "react";
import { useWebSocketContext } from "@/webSocketContext";
import { Editor } from "@monaco-editor/react";
import { Button, Card, Dialog, Select } from "@sunwu51/camel-ui";
import moment from "moment";
import Effected from "./Effected";
import { genTraceId } from "../tabs/Common";

export default function LogContent() {
    const { sendMessage, lastMessage } = useWebSocketContext();
    const [log, setLog] = useState([]);
    const [level, setLevel] = useState(1);
    const logRef = useRef([]);
    const lastMessageKeyRef = useRef(null);
    const appendLogMessage = (message) => {
        if (message != null && message.data != null) {
            try {
                const messageKey = `${message.timestamp || ''}:${message.data}`;
                if (lastMessageKeyRef.current === messageKey) {
                    return;
                }
                lastMessageKeyRef.current = messageKey;
                let msg = normalizeLogMessage(message.data);
                if (msg == null) {
                    return;
                }
                logRef.current.push(msg);
                while (logRef.current.length > 1000) {
                    logRef.current.shift()
                }
                let res = [...logRef.current];
                setLog(res)
            } catch (e) {
                console.warn(e)
            }
        }
    };
    useEffect(() => {
        appendLogMessage(lastMessage);
    }, [lastMessage]);

    useEffect(() => {
        const onLogMessage = (event) => appendLogMessage(event.detail);
        window.addEventListener('swapper-log-message', onLogMessage);
        return () => window.removeEventListener('swapper-log-message', onLogMessage);
    }, []);

    const editorRef = useRef(null);
    const handleEditorDidMount = (editor,) => {
        editorRef.current = editor;
        // Function to scroll to the last line of the editor
        const scrollToBottom = () => {
            const model = editor.getModel();
            if (model) {
                const lineCount = model.getLineCount();
                editor.revealLineInCenterIfOutsideViewport(lineCount);
            }
        };

        // Function to fold all code blocks
        const foldAll = () => {
            const model = editor.getModel();
            if (model) {
                editor.getAction('editor.foldAll').run();
            }
        };

        // Scroll to bottom when editor is initialized
        scrollToBottom();

        // Fold all code blocks initially
        foldAll();

        // Listen for content changes and scroll to bottom
        editor.onDidChangeModelContent(() => {
            scrollToBottom();
        });

        // Listen for editor layout changes and fold all code blocks after the layout
        editor.onDidLayoutChange(() => {
        });
    };
    const reset = async () => {
        const id = genTraceId();
        const response = await sendMessage({ id, timestamp: new Date().getTime(), type: "RESET"});
        const structuredContent = response?.result?.structuredContent;
        if (structuredContent != null) {
            appendLogMessage({
                timestamp: Date.now(),
                data: JSON.stringify({
                    type: 'LOG',
                    id,
                    level: structuredContent.success ? 1 : 2,
                    timestamp: Date.now(),
                    content: structuredContent.message || JSON.stringify(structuredContent),
                })
            });
        }
    }

    return <div className="w-full">
        <div className="flex items-center">
            <Button className="bg-[var(--w-green)] hover:bg-[var(--w-green-dark)] hover:text-white" onPress={() => { logRef.current = []; setLog(logRef.current) }}>clear log</Button>
            <Dialog title={"Effected"} trigger={<Button className="bg-[var(--w-indigo)] hover:bg-[var(--w-indigo-dark)] hover:text-white">effected classes</Button>}>
                <Effected />
            </Dialog>
            <Button className="bg-[var(--w-red)] hover:bg-[var(--w-red-dark)] hover:text-white" onPress={reset}>reset(remove all magic)</Button>
            <Select items={['debug', 'info']} className="w-64" defaultIndex={1}
                onSelectedItemChange={(e) => {setLevel(['debug', 'info'].indexOf(e.selectedItem)) }}>
            </Select>
        </div>
        <Card>
            <Editor height="calc(100vh - 150px)" defaultLanguage="java" width={'100%'}
                value={log.filter(it => it.level >= level).map(msg => `[${msg.id}][${moment(msg.timestamp).format("YYYYMMDD HH:mm:ss")}]\n${msg.content}`).join('\n')}
                theme="vs-dark"
                options={{ readOnly: true, wordWrap: true}}
                onMount={handleEditorDidMount} />
        </Card>
    </div>

}

function normalizeLogMessage(data) {
    let msg = typeof data === 'string' ? JSON.parse(data) : data;
    if (msg == null) {
        return null;
    }
    if (msg.type === 'LOG' || msg.type === 8) {
        return {
            ...msg,
            type: 'LOG',
            level: Number.isFinite(Number(msg.level)) ? Number(msg.level) : 1,
            timestamp: msg.timestamp || Date.now(),
            content: msg.content == null ? '' : String(msg.content),
        };
    }
    if (msg.type === 'DEBUG_BREAKPOINT' || msg.type === 'DEBUG_HIT') {
        return null;
    }
    if (msg.result?.structuredContent != null) {
        return {
            type: 'LOG',
            id: msg.id,
            level: msg.result.structuredContent.success === false ? 2 : 1,
            timestamp: Date.now(),
            content: JSON.stringify(msg.result.structuredContent, null, 2),
        };
    }
    if (typeof data === 'string' && data.trim().length > 0) {
        return {
            type: 'LOG',
            id: '',
            level: 1,
            timestamp: Date.now(),
            content: data,
        };
    }
    return null;
}
