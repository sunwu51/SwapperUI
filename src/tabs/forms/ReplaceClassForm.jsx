import { Button, Inputfile, Input } from "@sunwu51/camel-ui";
import { TabPanelItem } from "@/tabs/Common";
import { useForm } from "@tanstack/react-form";
import { useWebSocketContext } from "../../layout";
import { ReadyState } from "react-use-websocket";
import { genTraceId } from "../Common";
import { useState } from "react";
import toast from "react-hot-toast";

export function ReplaceClassForm() {
    const { sendMessage, readyState } = useWebSocketContext();
    const [b64, setb64] = useState(null);
    const form = useForm({
        defaultValues: {
            className: '',
        },
        onSubmit: async ({ value }) => {
            // Do something with form data
            const data = {
                id: genTraceId(),
                timestamp: new Date().getTime(),
                type: "REPLACE_CLASS",
                content: b64,
                ...value
            }
            if (readyState == ReadyState.OPEN) {
                if (!b64) toast('❗ select a file ❗');
                else sendMessage(JSON.stringify(data))
            } else {
                toast('❗ ws status invalid')
            }
        },
    })
    const fileHandle = async (file) => {
        console.log(file)
        var content = await fileToBase64(file)
        console.log(content)
        setb64(content);
    }
    return <TabPanelItem title="ReplaceClass" open={true}>
        <div className="my-4 mx-2">
            <p>Upload a .class file to hot swap the origin class in jvm</p>
        </div>
        <div className="my-4 mx-2">
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    form.handleSubmit();
                }}
            >
                <div className="my-2">
                    <Inputfile className="p-0" onChange={fileHandle}>
                        <Button>select file</Button>
                    </Inputfile>
                </div>
                <div className="my-2">
                    <form.Field name="className" validators={{
                        onChange: ({ value }) => {return !value || value.length == 0 ? 'Invalid signature' : undefined},
                    }}>
                        {(field) => (
                            <>
                                <Input className="p-0"
                                    name={field.name}
                                    onBlur={field.handleBlur}
                                    onChange={(v) => field.handleChange(v)}
                                    label="Input the class signature (package.ClassName)"
                                ></Input>
                                {field.state.meta.errors ? (
                                    <em role="alert" className="text-[var(--w-red)]">{field.state.meta.errors.join(', ')}</em>
                                ) : null}
                            </>)}
                    </form.Field>
                </div>
                <Button type="submit" className="bg-[var(--w-yellow)] hover:bg-[var(--w-yellow-dark)] hover:text-white">replace</Button>
            </form>
        </div>
    </TabPanelItem>

}

export function DecompileForm() {
    const { sendMessage, readyState } = useWebSocketContext();
    const form = useForm({
        defaultValues: {
            className: '',
        },
        onSubmit: async ({ value }) => {
            // Do something with form data
            const data = {
                id: genTraceId(),
                timestamp: new Date().getTime(),
                type: "DECOMPILE",
                ...value
            }
            if (readyState == ReadyState.OPEN) {
               sendMessage(JSON.stringify(data))
            } else {
                toast('❗ ws status invalid')
            }
        },
    })
   
    return <TabPanelItem title="Decompile" open={true}>
        <div className="my-4 mx-2">
            <p>Input a className to decompile</p>
        </div>
        <div className="my-4 mx-2">
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    form.handleSubmit();
                }}
            >
                <div className="my-2">
                    <form.Field name="className" validators={{
                        onChange: ({ value }) => {return !value || value.length == 0 ? 'Invalid signature' : undefined},
                    }}>
                        {(field) => (
                            <>
                                <Input className="p-0"
                                    name={field.name}
                                    onBlur={field.handleBlur}
                                    onChange={(v) => field.handleChange(v)}
                                    label="Class name (package.ClassName)"
                                ></Input>
                                {field.state.meta.errors ? (
                                    <em role="alert" className="text-[var(--w-red)]">{field.state.meta.errors.join(', ')}</em>
                                ) : null}
                            </>)}
                    </form.Field>
                </div>
                <Button type="submit" className="bg-[var(--w-yellow)] hover:bg-[var(--w-yellow-dark)] hover:text-white">decompile</Button>
            </form>
        </div>
    </TabPanelItem>

}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = (error) => {
            reject(error);
        };
        reader.readAsDataURL(file);
    });
}
