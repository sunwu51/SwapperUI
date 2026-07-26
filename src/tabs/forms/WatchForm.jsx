import { Button,  Input, Radio, RadioGroup } from "@sunwu51/camel-ui";
import { TabPanelItem, genTraceId } from "@/tabs/Common";
import { useForm } from '@tanstack/react-form'
import { useWebSocketContext } from "@/layout";
import { ReadyState } from "@/layout";
import toast from "react-hot-toast";

export function WatchForm() {
    const { sendMessage, readyState } = useWebSocketContext();
    const form = useForm({
        defaultValues: {
            signature: '',
            minCost: 0,
            printFormat: 1,
            depthForJson: 3,
            ognl: '',
            variables: '',
        },
        onSubmit: async ({ value }) => {
            // Do something with form data
            const { variables, ...rest } = value;
            let parsedVariables;
            try {
                parsedVariables = parseVariables(variables);
            } catch (e) {
                toast('❗ variables should be a JSON object')
                return;
            }
            const data = {
                id: genTraceId(),
                timestamp: new Date().getTime(),
                type: "WATCH",
                ...rest,
                variables: parsedVariables,
            }
            if (readyState == ReadyState.OPEN) {
                sendMessage(JSON.stringify(data))
            } else {
                toast('❗ http status invalid')
            }
        },
    })
    return <TabPanelItem title="Watch" open={true}>
        <form
            onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
            }}
        >
            <div className="my-4 mx-2">
                <p>watch a specific method, will print the method params and return value</p>
            </div>
            <div className="my-4 mx-2">
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
                                ) : null}</>
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
                                    label="Input the min cost(ms) filter"
                                    type="number"
                                    defaultValue="0"
                                    name={field.name}
                                    onBlur={field.handleBlur}
                                    onChange={(v) => field.handleChange(parseInt(v))}

                                ></Input>
{field.state.meta.errors ? (
                                    <em role="alert" className="text-[var(--w-red)]">{field.state.meta.errors.join(', ')}</em>
                                ) : null}
                            </>
                        )}
                    </form.Field>
                </div>
                <div className="my-2">
                    <form.Field name="printFormat">
                        {(field) => (
                            <RadioGroup name={field.name}
                                onBlur={field.handleBlur}
                                onChange={(v) => field.handleChange(parseInt(v))}
                                className="p-0"
                                label="PrintFormat"
                                defaultValue={1}>
                                <Radio value={1}>toString</Radio>
                                <Radio value={2}>toJson</Radio>
                                {/* <Radio value={3}>Pretty</Radio> */}
                            </RadioGroup>)}
                    </form.Field>
                </div>
                <div className="my-2">
                    <form.Field name="depthForJson" validators={{
                        onChange: ({ value }) => isNaN(value) || value <= 0 ? 'Invalid depthForJson' : undefined,
                    }}>
                        {(field) => (
                            <>
                                <Input className="p-0"
                                    label="JSON depth"
                                    type="number"
                                    defaultValue="3"
                                    name={field.name}
                                    onBlur={field.handleBlur}
                                    onChange={(v) => field.handleChange(parseInt(v))}
                                ></Input>
                                {field.state.meta.errors ? (
                                    <em role="alert" className="text-[var(--w-red)]">{field.state.meta.errors.join(', ')}</em>
                                ) : null}
                            </>
                        )}
                    </form.Field>
                </div>
                <div className="my-2">
                    <form.Field name="ognl">
                        {(field) => (
                            <Input className="p-0"
                                name={field.name}
                                onBlur={field.handleBlur}
                                onChange={(v) => field.handleChange(v)}
                                label="Optional OGNL expression"
                                placeholder='@w.util.SpringUtils@getSpringBootApplicationContext().getBean("userController").getUserById(1)'
                            ></Input>
                        )}
                    </form.Field>
                </div>
                <div className="my-2">
                    <form.Field name="variables" validators={{
                        onChange: ({ value }) => validateVariables(value),
                    }}>
                        {(field) => (
                            <>
                                <Input className="p-0"
                                    name={field.name}
                                    onBlur={field.handleBlur}
                                    onChange={(v) => field.handleChange(v)}
                                    label="Custom OGNL variables(JSON)"
                                    placeholder='{"user":"#req[0]","saved":"@w.Global@stash(\"last\", #res)"}'
                                ></Input>
                                {field.state.meta.errors ? (
                                    <em role="alert" className="text-[var(--w-red)]">{field.state.meta.errors.join(', ')}</em>
                                ) : null}
                            </>
                        )}
                    </form.Field>
                </div>
                <Button type="submit">watch</Button>
            </div>
        </form>
    </TabPanelItem>
}

function parseVariables(value) {
    if (!value || !value.trim()) {
        return undefined;
    }
    const parsed = JSON.parse(value);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('variables should be a JSON object');
    }
    return parsed;
}

function validateVariables(value) {
    if (!value || !value.trim()) {
        return undefined;
    }
    try {
        const parsed = JSON.parse(value);
        return parsed && !Array.isArray(parsed) && typeof parsed === 'object'
            ? undefined
            : 'variables should be a JSON object';
    } catch (e) {
        return 'Invalid JSON object';
    }
}
