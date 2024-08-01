import { useEffect, useRef, useState } from "react";
import { useWebSocketContext } from "@/layout";
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
    useEffect(() => {
        if (lastMessage != null && lastMessage.data != null) {
            try {
                let msg = JSON.parse(lastMessage.data);
                if (msg.type != 'LOG') {
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
    }, [lastMessage]);

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
        sendMessage(JSON.stringify({ id: genTraceId(), timestamp: new Date().getTime(), type: "RESET"}));
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