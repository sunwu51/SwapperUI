import { Button } from "@sunwu51/camel-ui";
import { TabPanelItem } from "@/tabs/Common";
import { Editor } from "@monaco-editor/react";
import { useState } from "react";
import { genTraceId } from "../Common";
import { useWebSocketContext } from "../../layout";
import { ReadyState } from "react-use-websocket";
import toast from "react-hot-toast";

const defultExecCode = `package w;
import w.Global;
import w.util.SpringUtils;
import org.springframework.context.ApplicationContext;
import java.util.*;

public class Exec{ 
  public void exec() {
    try {
      // use spring ctx if a spring boot project
      ApplicationContext ctx = 
        (ApplicationContext) SpringUtils.getSpringBootApplicationContext();

      Global.info(Arrays.toString(ctx.getBeanDefinitionNames()));
      
      Global.info("--------------");

      // use ognl
      Global.info(Global.ognl("@java.util.Arrays@toString(#root)", 
        ctx.getBeanDefinitionNames()));

    } catch (Exception e) {
      Global.error(e.toString(), e);
    }
  }
}`


export function ExecuteForm() {
    const [code, setCode] = useState(defultExecCode);
    const { sendMessage, readyState } = useWebSocketContext();

    const submit = ()=>{
        const data = {
            id: genTraceId(),
            timestamp: new Date().getTime(),
            type: "EXEC",
            mode: 1,
            body: code,
        }
        if (readyState == ReadyState.OPEN) {
            sendMessage(JSON.stringify(data))
        } else {
            toast('❗ ws status invalid')
        }
    }

    return <TabPanelItem title="Execute" open={true}>
        <div className="my-4 mx-2">
            <p>Use a new Thread to run some code.</p>
        </div>

        <div className="my-4 mx-2">
            <div className="my-2 text-[0.75rem]">
                <Editor height="500px" defaultLanguage="java"
                    value={code}
                    onChange={setCode}
                    options={{wordWrap:true,fontSize: 12 }}
                    theme="vs-dark" />
            </div>
            <Button onPress={submit} className="bg-[var(--w-yellow)] hover:bg-[var(--w-yellow-dark)] hover:text-white">Execute</Button>
        </div>
    </TabPanelItem>

}
