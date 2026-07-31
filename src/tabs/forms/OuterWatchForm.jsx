import { Button, Checkbox, Input, Radio, RadioGroup } from "@sunwu51/camel-ui";
import { TabPanelItem, genTraceId } from "@/tabs/Common";
import { useForm } from '@tanstack/react-form'
import { useWebSocketContext } from "@/layout";
import { ReadyState } from "@/layout";
import toast from "react-hot-toast";
import { Editor } from "@monaco-editor/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function OuterWatchForm() {
    const { sendMessage, readyState } = useWebSocketContext();
    const [classNameDialogOpen, setClassNameDialogOpen] = useState(false);
    const [inspectClassName, setInspectClassName] = useState('');
    const [inspectOpen, setInspectOpen] = useState(false);
    const [inspectLoading, setInspectLoading] = useState(false);
    const [decompileResult, setDecompileResult] = useState(null);
    const [selectedInvocation, setSelectedInvocation] = useState(null);
    const [inspectWidth, setInspectWidth] = useState(null);
    const [inspectResizing, setInspectResizing] = useState(false);
    const editorRef = useRef(null);
    const decorationsRef = useRef([]);
    const invocationTargetsRef = useRef([]);
    const outerSignatureFieldRef = useRef(null);
    const innerSignatureFieldRef = useRef(null);
    const inspectionModel = useMemo(
        () => buildInspectionModel(decompileResult),
        [decompileResult],
    );
    const { visibleInvocations, invocationTargets } = inspectionModel;
    invocationTargetsRef.current = invocationTargets;
    const decorateInvocations = useCallback((editor, selected) => {
        if (!editor || !decompileResult) return;
        const decorations = invocationTargets.map(({ range }) => ({
            range,
            options: { inlineClassName: 'outer-watch-invocation-token' },
        }));
        for (const invocation of visibleInvocations) {
            if (invocation !== selected) continue;
            decorations.push({
                range: {
                    startLineNumber: invocation.decompiledLine,
                    startColumn: 1,
                    endLineNumber: invocation.decompiledLine,
                    endColumn: 1,
                },
                options: { isWholeLine: true, className: 'outer-watch-invocation-line' },
            });
            break;
        }
        decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decorations);
    }, [decompileResult, invocationTargets, visibleInvocations]);
    const form = useForm({
        defaultValues: {
            printFormat: 1,
            depthForJson: 3,
            signature: '',
            innerSignature: '',
            includeNested: true,
            printLvt: false,
            ognl: '',
            variables: '',
        },
        onSubmit: async ({ value }) => {
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
                type: "OUTER_WATCH",
                ...rest,
                variables: parsedVariables,
            }
            if (readyState == ReadyState.OPEN) {
                sendMessage(JSON.stringify(data))
                setInspectOpen(false);
            } else {
                toast('❗ http status invalid')
            }
        },
    })
    useEffect(() => {
        decorateInvocations(editorRef.current, selectedInvocation);
    }, [decorateInvocations, selectedInvocation]);
    useEffect(() => {
        if (!inspectResizing) return undefined;
        const previousCursor = document.body.style.cursor;
        const previousUserSelect = document.body.style.userSelect;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        const resize = (event) => {
            const viewportPadding = 16;
            const maximumWidth = window.innerWidth - (viewportPadding * 2);
            const minimumWidth = Math.min(720, maximumWidth);
            setInspectWidth(Math.max(minimumWidth, Math.min(maximumWidth, window.innerWidth - viewportPadding - event.clientX)));
        };
        const stopResizing = () => setInspectResizing(false);
        window.addEventListener('pointermove', resize);
        window.addEventListener('pointerup', stopResizing, { once: true });
        window.addEventListener('pointercancel', stopResizing, { once: true });
        return () => {
            window.removeEventListener('pointermove', resize);
            window.removeEventListener('pointerup', stopResizing);
            window.removeEventListener('pointercancel', stopResizing);
            document.body.style.cursor = previousCursor;
            document.body.style.userSelect = previousUserSelect;
        };
    }, [inspectResizing]);

    const decompileClass = async () => {
        const className = inspectClassName.trim();
        if (!className) {
            toast('enter a class name first');
            return;
        }
        setInspectLoading(true);
        try {
            const json = await sendMessage({
                id: genTraceId(),
                timestamp: new Date().getTime(),
                type: 'DECOMPILE',
                className,
            });
            const result = json?.result?.structuredContent?.data?.data;
            if (result?.source) {
                setDecompileResult(result);
                setSelectedInvocation(null);
                setClassNameDialogOpen(false);
                setInspectOpen(true);
            } else {
                toast('decompile did not return source');
            }
        } finally {
            setInspectLoading(false);
        }
    };

    const selectInvocation = (invocation) => {
        const outerSignature = invocation.outerSignature
            || `${invocation.declaringClass}#${invocation.outerMethod}`;
        const innerSignature = invocation.innerSignature
            || `${invocation.owner}#${invocation.name}`;
        outerSignatureFieldRef.current?.handleChange(outerSignature);
        innerSignatureFieldRef.current?.handleChange(innerSignature);
        setSelectedInvocation(invocation);
        if (editorRef.current && invocation.decompiledLine) {
            editorRef.current.revealLineInCenter(invocation.decompiledLine);
        }
    };

    const selectInvocationTarget = (target) => {
        const signatures = new Set(target.invocations.map(
            invocation => `${invocation.owner}#${invocation.name}`,
        ));
        if (signatures.size > 1) {
            toast('This line contains same-name calls from different classes. Select the exact call from the right list.', {
                position: 'top-left',
                style: {
                    minWidth: '220px',
                    maxWidth: '220px',
                },
            });
            return;
        }
        selectInvocation(target.invocations[0]);
    };
    return <TabPanelItem title="OuterWatch">
        <div className="mx-2 mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" onPress={() => setClassNameDialogOpen(true)}>Inspect calls</Button>
            <span className="text-sm text-gray-600">
                Inspect a class, then click a call in the source or call list to fill the OuterWatch methods.
            </span>
        </div>
        <div className="my-4 mx-2">
            <p>outer-watch is similar with watch, the focus of this is the innerMethod in the outerMethod</p>
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
                        {(field) => {
                            outerSignatureFieldRef.current = field;
                            return <>
                                <Input className="p-0"
                                    name={field.name}
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(v) => field.handleChange(v)}
                                    label="Input the outer method signature"
                                    placeholder="package.name.ClassName#methodName"
                                ></Input>
                                {field.state.meta.errors ? (
                                    <em role="alert" className="text-[var(--w-red)]">{field.state.meta.errors.join(', ')}</em>
                                ) : null}
                            </>;
                        }}
                    </form.Field>
                </div>
                <div className="my-2">
                    <form.Field name="innerSignature" validators={{
                        onChange: ({ value }) => value.split('#').length != 2 || value.split('#').filter(it => it.length > 0).length != 2 ? 'Invalid signature' : undefined,
                    }}>
                        {(field) => {
                            innerSignatureFieldRef.current = field;
                            return <>
                                <Input className="p-0"
                                    name={field.name}
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(v) => field.handleChange(v)}
                                    label="Input the inner method signature"
                                    placeholder="package.name.ClassName#methodName"
                                ></Input>
                                {field.state.meta.errors ? (
                                    <em role="alert" className="text-[var(--w-red)]">{field.state.meta.errors.join(', ')}</em>
                                ) : null}
                            </>;
                        }}</form.Field>
                </div>
                <div className="my-2">
                    <form.Field name="printFormat">
                        {(field) => (
                            <RadioGroup className="p-0"
                                name={field.name}
                                onBlur={field.handleBlur}
                                onChange={(v) => field.handleChange(parseInt(v))}
                                label="PrintFormat" defaultValue={1}>
                                <Radio value={1}>toString</Radio>
                                <Radio value={2}>toJson</Radio>
                                {/* <Radio value={3}>Pretty</Radio> */}
                        </RadioGroup>)}</form.Field>
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
                <div className="my-2 ml-[-5px]">
                    <form.Field name="includeNested">
                        {(field) => <Checkbox name={field.name}
                            isSelected={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(v) => field.handleChange(v)}
                        >include synchronous lambdas and anonymous inner classes</Checkbox>}
                    </form.Field>
                </div>
                <div className="my-2 ml-[-5px]">
                    <form.Field name="printLvt">
                        {(field) => <Checkbox name={field.name}
                            isSelected={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(v) => field.handleChange(v)}
                        >print local variables from LVT</Checkbox>}
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
                                    placeholder='{"result":"#res","saved":"@w.Global@stash(\"last\", #res)"}'
                                ></Input>
                                {field.state.meta.errors ? (
                                    <em role="alert" className="text-[var(--w-red)]">{field.state.meta.errors.join(', ')}</em>
                                ) : null}
                            </>
                        )}
                    </form.Field>
                </div>
                <div className="flex gap-2">
                    <Button type="submit">watch</Button>
                </div>
            </form>
        </div>
        {classNameDialogOpen && createPortal(<div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/45 p-4"
            role="dialog" aria-modal="true" aria-labelledby="inspect-class-title">
            <div className="w-full max-w-lg rounded border border-gray-300 bg-white p-5 shadow-xl">
                <div className="mb-4 flex items-center justify-between gap-4">
                    <h2 id="inspect-class-title" className="text-lg font-semibold">Inspect class calls</h2>
                    <button type="button" className="text-2xl leading-none text-gray-500 hover:text-black"
                        aria-label="Close" onClick={() => setClassNameDialogOpen(false)}>&times;</button>
                </div>
                <Input className="p-0" label="Class name" value={inspectClassName}
                    onChange={setInspectClassName}
                    placeholder="package.name.ClassName"
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') decompileClass();
                    }} />
                <div className="mt-5 flex justify-end gap-2">
                    <Button type="button" onPress={() => setClassNameDialogOpen(false)}>Cancel</Button>
                    <Button type="button" isDisabled={inspectLoading} onPress={decompileClass}>
                        {inspectLoading ? 'Inspecting...' : 'Inspect'}
                    </Button>
                </div>
            </div>
        </div>, document.body)}
        {inspectOpen && decompileResult && createPortal(<div className="fixed bottom-4 right-4 top-4 z-[10000] min-w-[min(720px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-hidden border border-gray-400 bg-white shadow-2xl"
            style={{ width: inspectWidth ? `${inspectWidth}px` : 'min(68.4vw, 1152px)' }}
            role="dialog" aria-modal="false" aria-labelledby="inspect-calls-title">
            <div className="absolute bottom-0 left-0 top-0 z-10 w-2 -translate-x-1/2 cursor-col-resize touch-none"
                role="separator" aria-label="Resize inspect calls panel" aria-orientation="vertical"
                title="Drag to resize" onPointerDown={(event) => {
                    event.preventDefault();
                    setInspectResizing(true);
                }} />
            <div className="flex h-14 items-center justify-between gap-4 border-b border-gray-300 bg-white px-4">
                <div className="min-w-0">
                    <h2 id="inspect-calls-title" className="font-semibold">Inspect calls</h2>
                    <div className="truncate text-xs text-gray-500">{decompileResult.className}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                    <Button type="button" onPress={() => setInspectOpen(false)}>Close</Button>
                </div>
            </div>
            <div className="grid h-[calc(100%-3.5rem)] grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
                <Editor value={decompileResult.source} language="java" theme="vs-dark"
                    options={{ readOnly: true, minimap: { enabled: false }, lineNumbersMinChars: 3 }}
                    onMount={(editor) => {
                        editorRef.current = editor;
                        decorateInvocations(editor, selectedInvocation);
                        editor.onMouseDown((event) => {
                            const position = event.target.position;
                            if (!position) return;
                            const match = invocationTargetsRef.current.find(({ range }) =>
                                range.startLineNumber === position.lineNumber
                                && position.column >= range.startColumn
                                && position.column < range.endColumn);
                            if (match) selectInvocationTarget(match);
                        });
                    }} />
                <div className="overflow-auto border-l border-[var(--w-black)] bg-white">
                    {visibleInvocations.map((invocation, index) =>
                        <button key={`${invocation.declaringClass}-${invocation.outerMethod}-${index}`}
                            type="button" onClick={() => selectInvocation(invocation)}
                            className={`block w-full border-b border-gray-200 p-3 text-left hover:bg-yellow-50 ${selectedInvocation === invocation ? 'bg-yellow-100' : ''}`}>
                            <div className="font-semibold break-all">{invocation.owner}#{invocation.name}</div>
                            <div className="mt-1 text-xs text-gray-600 break-all">{invocation.descriptor}</div>
                            <div className="mt-1 text-xs text-gray-500">
                                {invocation.opcode} · {invocation.outerMethod} · decompiled line {invocation.decompiledLine}
                            </div>
                        </button>)}
                    {visibleInvocations.length === 0 &&
                        <div className="p-4 text-sm text-gray-500">No mapped method invocation found.</div>}
                </div>
            </div>
        </div>, document.body)}
    </TabPanelItem>

}

function buildInspectionModel(decompileResult) {
    if (!decompileResult?.source) {
        return { visibleInvocations: [], invocationTargets: [] };
    }
    const lines = decompileResult.source.split(/\r?\n/);
    const invocationGroups = new Map();
    for (const invocation of decompileResult.invocations || []) {
        if (!invocation.decompiledLine || invocation.name === '<init>' || invocation.name === '<clinit>') {
            continue;
        }
        const line = lines[invocation.decompiledLine - 1];
        if (line === undefined) continue;
        const key = `${invocation.decompiledLine}:${invocation.name}`;
        if (!invocationGroups.has(key)) invocationGroups.set(key, { line, invocations: [] });
        invocationGroups.get(key).invocations.push(invocation);
    }

    const visibleInvocations = [];
    const invocationTargets = [];
    for (const { line, invocations } of invocationGroups.values()) {
        const { decompiledLine, name } = invocations[0];
        const columns = findCallTokenColumns(line, name);
        if (columns.length === 0) continue;
        visibleInvocations.push(...invocations);
        for (const column of columns) {
            const startColumn = column + 1;
            invocationTargets.push({
                invocations,
                range: {
                    startLineNumber: decompiledLine,
                    startColumn,
                    endLineNumber: decompiledLine,
                    endColumn: startColumn + name.length,
                },
            });
        }
    }
    return { visibleInvocations, invocationTargets };
}

function findCallTokenColumns(line, methodName) {
    const columns = [];
    let fromIndex = 0;
    while (fromIndex < line.length) {
        const index = line.indexOf(methodName, fromIndex);
        if (index < 0) break;
        const before = index > 0 ? line[index - 1] : '';
        let afterIndex = index + methodName.length;
        while (afterIndex < line.length && /\s/.test(line[afterIndex])) afterIndex++;
        const identifierBefore = before && /[\w$]/.test(before);
        if (!identifierBefore && line[afterIndex] === '(') columns.push(index);
        fromIndex = index + methodName.length;
    }
    return columns;
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
