import { Button,  Checkbox,  Input } from "@sunwu51/camel-ui";
import { TabPanelItem, genTraceId } from "@/tabs/Common";
import { useForm } from '@tanstack/react-form'
import { useWebSocketContext } from "@/layout";
import { ReadyState } from "react-use-websocket";
import toast from "react-hot-toast";

export function TraceFrom() {
    const { sendMessage, readyState } = useWebSocketContext();
    const form = useForm({
        defaultValues: {
            signature: '',
            minCost: 0,
            ignoreZero: false
        },
        onSubmit: async ({ value }) => {
            const data = {
                id: genTraceId(),
                timestamp: new Date().getTime(),
                type: "TRACE",
                ...value
            }
            if (readyState == ReadyState.OPEN) {
                sendMessage(JSON.stringify(data))
            } else {
                toast('❗ ws status invalid')
            }
        },
    })
    return <TabPanelItem title="Trace">
        <div className="my-4 mx-2">
            <p>trace is to record the time consumption of each inner-method</p>
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
                    <form.Field name="minCost" validators={{
                        onChange: ({ value }) => isNaN(value) || value<0 ? 'Invalid minCost' : undefined,
                    }}>
                        {(field) => (
                            <>
                                <Input className="p-0"
                                    name={field.name}
                                    onBlur={field.handleBlur}
                                    onChange={(v) => field.handleChange(parseInt(v))}
                                    label="Input the min cost(ms) filter"
                                    type="number"
                                    defaultValue="0"
                                ></Input>
                                {field.state.meta.errors ? (
                                    <em role="alert" className="text-[var(--w-red)]">{field.state.meta.errors.join(', ')}</em>
                                ) : null}
                            </>
                        )}</form.Field>
                </div>
                <div className="my-2 ml-[-5px]">
                    <form.Field name="ignoreZero">
                        {(field) => <Checkbox name={field.name}
                            onBlur={field.handleBlur}
                            onChange={(v) => field.handleChange(v)}
                        >ignore sub method cost &lt;= 0mills</Checkbox>}
                    </form.Field>
                </div>
                <Button type="submit" isDisabled={!form.state.isValid}>trace</Button>
            </form>
        </div>
    </TabPanelItem>
}