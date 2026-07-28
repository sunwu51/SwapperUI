import { useCallback, useEffect, useState } from "react"
import { useWebSocketContext } from "../webSocketContext";
import { Editor } from "@monaco-editor/react";
import { Button, Input } from "@sunwu51/camel-ui";
import { genTraceId } from "../tabs/Common";

export default function Effected() {
    const { sendMessage } = useWebSocketContext();
    const [UUID, setUUID] = useState('');
    const [effectedClasses, setEffectedClasses] = useState({});

    const refreshEffectedClasses = useCallback(async () => {
        const response = await sendMessage({ id: "_", type: "PING" });
        const structuredContent = response?.result?.structuredContent;
        if (structuredContent?.success) {
            setEffectedClasses(structuredContent.data || {});
        }
    }, [sendMessage]);

    useEffect(() => {
        refreshEffectedClasses();
        let timer = setInterval(refreshEffectedClasses, 2000);
        return () => clearInterval(timer)
    }, [refreshEffectedClasses]);

    const delByUUID = async () => {
        const response = await sendMessage({ id: genTraceId(), timestamp: new Date().getTime(), type: "DELETE", uuid: UUID });
        if (response?.result?.structuredContent?.success) {
            refreshEffectedClasses();
        }
    }

    return <div>
        <Editor height="calc(50vh)" defaultLanguage="json" width={'70vw'}
            value={JSON.stringify(effectedClasses, null, 2)}
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
