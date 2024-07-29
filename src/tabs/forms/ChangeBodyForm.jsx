import { Button, Input, Radio, RadioGroup } from "@sunwu51/camel-ui";
import { TabPanelItem, genTraceId } from "@/tabs/Common";
import { useForm } from '@tanstack/react-form'
import { useWebSocketContext } from "@/layout";
import { ReadyState } from "react-use-websocket";
import { Editor } from "@monaco-editor/react";
import { useState } from "react";
import toast from "react-hot-toast";

const defaultChangeBodyCode = `{
    return java.util.UUID.randomUUID().toString();
}`

export function ChangeBodyForm() {
    const { sendMessage, readyState } = useWebSocketContext();
    const [code, setCode] = useState(defaultChangeBodyCode);
    const form = useForm({
        defaultValues: {
            mode: 0,
            signature: '',
            paramTypes: '',
            body: code
        },
        onSubmit: async ({ value }) => {
            const data = {
                id: genTraceId(),
                timestamp: new Date().getTime(),
                type: "CHANGE_BODY",
                className: value.signature.split("#")[0],
                method: value.signature.split("#")[1],
                body: code,
                paramTypes: value.paramTypes.split(",").map(it => it.trim())
                    .filter(it => it.length !== 0)
            }
            if (readyState == ReadyState.OPEN) {
                sendMessage(JSON.stringify(data))
            } else {
                toast('❗ ws status invalid')
            }
        },
    })
    return <TabPanelItem title="ChangeBody" open={true}>
        <div className="my-4 mx-2">
            <p>Replace the whole method body using the code inputed</p>
        </div>
        <div className="my-4 mx-2">
            <form
                onSubmit={(e) => {
                    console.log(e)
                    e.preventDefault();
                    e.stopPropagation();
                    form.handleSubmit();
                }}
            >
                <div className="my-2">
                    <form.Field name="signature" validators={{
                        onChange: ({ value }) => value.split('#').length != 2 || value.split('#').filter(it => it.length > 0).length != 2 ? 'Invalid signature' : undefined,
                    }}>
                        {(field) => (
                            <>
                                <Input className="p-0"
                                    name={field.name}
                                    onBlur={field.handleBlur}
                                    onChange={(v) => field.handleChange(v)}
                                    label="Input the method signature"
                                    placeholder="package.name.ClassName#methodName"
                                ></Input>
                                {field.state.meta.errors ? (
                                    <em role="alert" className="text-[var(--w-red)]">{field.state.meta.errors.join(', ')}</em>
                                ) : null}
                            </>
                        )}
                    </form.Field>
                </div>
                <div className="my-2">
                    <form.Field name="paramTypes">
                        {(field) => (
                            <>
                                <Input className="p-0"
                                    name={field.name}
                                    onBlur={field.handleBlur}
                                    onChange={(v) => field.handleChange(v)}
                                    label="Param types split by comma"
                                    placeholder="e.g java.lang.String,java.util.List,int,..."
                                ></Input>
                                {field.state.meta.errors ? (
                                    <em role="alert" className="text-[var(--w-red)]">{field.state.meta.errors.join(', ')}</em>
                                ) : null}
                            </>
                        )}
                    </form.Field>

                </div>
                <div className="my-2">
                    <form.Field name="mode">
                        {(field) => (
                            <>
                                <RadioGroup
                                    name={field.name}
                                    onBlur={field.handleBlur}
                                    onChange={(v) => field.handleChange(v)}
                                    defaultValue={0} label="engine">
                                    <Radio value={0}>Javassist</Radio>
                                    <Radio value={1}>ASM</Radio>
                                </RadioGroup>
                            </>
                        )}
                    </form.Field>
                </div>
                <div className="my-2">
                    <Editor height="100px" defaultLanguage="java"
                        value={code}
                        onChange={(content) => { setCode(content) }}
                        theme="vs-dark" />
                </div>

                <Button type="submit" className="py-2">ChangeBody</Button>
            </form>
        </div>

    </TabPanelItem>
}