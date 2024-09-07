import { Button } from "@sunwu51/camel-ui";
import { TabPanelItem } from "@/tabs/Common";
import { Editor } from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { genTraceId } from "../Common";
import { useWebSocketContext } from "../../layout";
import { ReadyState } from "react-use-websocket";
import toast from "react-hot-toast";

export function EvalForm() {
  const [code, setCode] = useState("");
  const [cmdHis, setHis] = useState([]);
  const [hisPos, setHisPos] = useState(-1);
  const { sendMessage, readyState } = useWebSocketContext();


  const editorRef = useRef(null);
  const keyDownRef = useRef(null);

  const submit = useCallback(() => {
    if (code.trim() == "") {
      toast('❗ code empty')
      return
    }
    const data = {
      id: genTraceId(),
      timestamp: new Date().getTime(),
      type: "EVAL",
      body: code,
    }
    if (readyState == ReadyState.OPEN) {
      sendMessage(JSON.stringify(data))
      setHis([...cmdHis, code]);
      setHisPos(cmdHis.length + 1);
      if (!code.endsWith(" ")) setCode(code + " ")
      setTimeout(() => {
        setCode("")
      }, 10)

    } else {
      toast('❗ ws status invalid')
    }
  }, [code, readyState, sendMessage])

  useEffect(() => {
    if (editorRef.current != null) {
      if (keyDownRef.current!= null) keyDownRef.current.dispose();
      keyDownRef.current = editorRef.current.onKeyDown((event) => {
        if ((event.ctrlKey || event.metaKey) && event.code === 'Enter') {
          event.preventDefault();
          submit();
        }
        const position = editorRef.current.getPosition();
          const lineCount = editorRef.current.getModel().getLineCount();
        if (event.code === 'ArrowUp') {
          if (position.lineNumber === 1) {
            console.log({hisPos, cmdHis})
            if (hisPos > 0) {
              setHisPos(hisPos - 1);
              if (hisPos - 1 >= 0) {
                setCode(cmdHis[hisPos - 1])
              }
            }
          }
        }
        if (event.code === 'ArrowDown') {
          if (position.lineNumber === lineCount) {
            if (hisPos < cmdHis.length - 1) {
              setHisPos(hisPos + 1);
              if (hisPos + 1 <= cmdHis.length - 1) {
                setCode(cmdHis[hisPos + 1])
              }
            }
          }
        }
      });
    }
  }, [submit]);

  const handleEditorDidMount = (editor) => {
    editorRef.current = editor
  };

  

  return <TabPanelItem title="Eval" open={true}>
    <div className="my-4 mx-2">
      <p>If a command starts with &apos;!&apos;, it&apos;s interpreted by the shell; if not, it&apos;s Groovy code.</p>
    </div>
    <div className="my-4 mx-2">
      <div className="my-2 text-[1rem]">
        <Editor height="100px" defaultLanguage="java"
          onMount={handleEditorDidMount}
          value={code}
          onChange={setCode}
          options={{ wordWrap: true, fontSize: 12 }}
          theme="vs-dark" />
      </div>
      <Button onPress={submit} className="bg-[var(--w-yellow)] hover:bg-[var(--w-yellow-dark)] hover:text-white">Eval</Button>
    </div>
  </TabPanelItem>

}
