import { Button, Input, Radio, RadioGroup } from "@sunwu51/camel-ui";
import { TabPanelItem, genTraceId } from "@/tabs/Common";
import { useForm } from '@tanstack/react-form'
import { useWebSocketContext } from "@/layout";
import { ReadyState } from "react-use-websocket";
import { Editor } from "@monaco-editor/react";
import { useState } from "react";
import toast from "react-hot-toast";

const defultCode = `{
    // args: $1 $2 $3, returnVal: $_ 
    // $_ = java.util.UUID.randomUUID().toString();
}`

export function ChangeResultForm() {
    const { sendMessage, readyState } = useWebSocketContext();
    const [code, setCode] = useState(defultCode);
    const form = useForm({
        defaultValues: {
            mode: 0,
            signature: '',
            innerSignature: '',
            paramTypes: '',
        },
        onSubmit: async ({ value }) => {
            const data = {
                id: genTraceId(),
                timestamp: new Date().getTime(),
                type: "CHANGE_RESULT",
                className: value.signature.split("#")[0],
                method: value.signature.split("#")[1],
                paramTypes: value.paramTypes.split(",").map(it => it.trim())
                    .filter(it => it.length !== 0),
                innerClassName: value.innerSignature.split("#")[0],
                innerMethod: value.innerSignature.split("#")[1],
                mode: value.mode,
                body: code  ,

            }
            if (readyState == ReadyState.OPEN) {
                sendMessage(JSON.stringify(data))
            } else {
                toast('❗ ws status invalid')
            }
        },
    })
    return <TabPanelItem title="OuterChange">
        <div className="my-4 mx-2">
            <p>Similar with ChangeBody, but focus at the inner method</p>
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
                                    label="Input the outer method signature"
                                    placeholder="package.name.ClassName#methodName"
                                ></Input>
                                {field.state.meta.errors ? (
                                    <em role="alert" className="text-[var(--w-red)]">{field.state.meta.errors.join(', ')}</em>
                                ) : null}
                            </>
                        )}</form.Field>
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
                            </>)}</form.Field>
                </div>
                <div className="my-2">
                    <form.Field name="innerSignature" validators={{
                        onChange: ({ value }) => value.split('#').length != 2 || value.split('#').filter(it => it.length > 0).length != 2 ? 'Invalid signature' : undefined,
                    }}>
                        {(field) => (
                            <>
                                <Input className="p-0"
                                    name={field.name}
                                    onBlur={field.handleBlur}
                                    onChange={(v) => field.handleChange(v)}
                                    label="Input the inner method signature"
                                    placeholder="package.name.ClassName#methodName"
                                ></Input>
                                {field.state.meta.errors ? (
                                    <em role="alert" className="text-[var(--w-red)]">{field.state.meta.errors.join(', ')}</em>
                                ) : null}
                            </>)}</form.Field>
                </div>
                <div className="my-2">
                    <form.Field name="mode" >
                        {(field) => (
                            <RadioGroup
                                name={field.name}
                                onBlur={field.handleBlur}
                                onChange={(v) => field.handleChange(v)}
                                defaultValue={0} label="engine">
                                <Radio value={0}>Javassist</Radio>
                                <Radio value={1}>ASM</Radio>
                            </RadioGroup>)}</form.Field>
                </div>
                <div className="my-2">
                    <Editor height="200px" defaultLanguage="java"
                        value={code}
                        onChange={(content)=>setCode(content)}
                        theme="vs-dark" />
                </div>

                <Button type="submit" className="py-2">ChangeResult</Button>
            </form>
        </div>
    </TabPanelItem>
}
