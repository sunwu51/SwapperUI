import { useEffect, useState } from "react"
import { useWebSocketContext } from "../layout";
import { Editor } from "@monaco-editor/react";
import { Button, Input } from "@sunwu51/camel-ui";
import { genTraceId } from "../tabs/Common";

export default function Effected() {
    const { sendMessage, lastMessage } = useWebSocketContext();
    const [UUID, setUUID] = useState('');
    const [effectedClasses, setEffectedClasses] = useState("{}");
    // ping
    useEffect(() => {
        sendMessage(JSON.stringify({ id: "_", type: "PING" }))
        let timer = setInterval(() => sendMessage(JSON.stringify({ id: "_", type: "PING" })), 2000);
        return () => clearInterval(timer)
    }, []);

    // pong effected class metadata
    useEffect(() => {
        if (lastMessage != null && lastMessage.data != null) {
            let json = JSON.parse(lastMessage.data)
            if (json.content != null && json.type == 'PONG' && json.content != effectedClasses) {
                setEffectedClasses(JSON.stringify(json.content));
            }
        }
    },
        [lastMessage])

    const delByUUID = async () => {
        sendMessage(JSON.stringify({ id: genTraceId(), timestamp: new Date().getTime(), type: "DELETE", uuid: UUID }));
    }

    return <div>
        <Editor height="calc(50vh)" defaultLanguage="json" width={'70vw'}
            value={JSON.stringify(JSON.parse(effectedClasses), 0, 2)}
            options={{readOnly: true}}
            theme="vs-dark"
        />
        <div className="flex justify-between items-center">
            <div className="flex justify-start items-center">
                <Input className="w-64" placeholder="input uuid" direction="row" onChange={setUUID}></Input>
                <Button className="bg-[var(--w-yellow)] hover:bg-[var(--w-yellow-dark)] hover:text-white" onPress={delByUUID}>delete by UUID</Button>
            </div>
        </div>
    </div>
}