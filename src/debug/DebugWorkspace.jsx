import { Editor } from '@monaco-editor/react';
import { Button, Card, Checkbox, Input } from '@sunwu51/camel-ui';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useWebSocketContext } from '../webSocketContext';
import DebugHitDetails from './DebugHitDetails';
import { latestHit, mergeBreakpoint, normalizeHitSummaries } from './hitModel';
import { normalizeInspection } from './inspectionModel';

const ADJUST_HELP = 'If the selected line has no executable bytecode, move the breakpoint to the nearest executable line within the same method. It never crosses method boundaries.';
const MIN_SOURCE_FONT_SIZE = 10;
const MAX_SOURCE_FONT_SIZE = 20;
const DEFAULT_DETAIL_SECTIONS = {
    parameters: true,
    breakpointReturn: true,
    instanceFields: true,
    staticFields: true,
    method: true,
    callStack: true,
};

export default function DebugWorkspace({ visible }) {
    const { callTool, readyState } = useWebSocketContext();
    const [query, setQuery] = useState('');
    const [classes, setClasses] = useState([]);
    const [inspection, setInspection] = useState(null);
    const [breakpoints, setBreakpoints] = useState([]);
    const [selectedId, setSelectedId] = useState('');
    const [hits, setHits] = useState([]);
    const [selectedHitId, setSelectedHitId] = useState('');
    const [hitDetail, setHitDetail] = useState(null);
    const [detailSections, setDetailSections] = useState(DEFAULT_DETAIL_SECTIONS);
    const [focusedLine, setFocusedLine] = useState(0);
    const [dialog, setDialog] = useState(null);
    const [displayLine, setDisplayLine] = useState('');
    const [ttlSeconds, setTtlSeconds] = useState('600');
    const [maxHits, setMaxHits] = useState('10');
    const [adjustToNearest, setAdjustToNearest] = useState(false);
    const [busy, setBusy] = useState('');
    const [now, setNow] = useState(Date.now());
    const [maximized, setMaximized] = useState('');
    const [sourceFontSize, setSourceFontSize] = useState(13);
    const editorRef = useRef(null);
    const dialogRef = useRef(null);
    const gutterActionRef = useRef(() => {});
    const maximizeTriggerRef = useRef(null);
    const searchGeneration = useRef(0);
    const inspectGeneration = useRef(0);
    const breakpointGeneration = useRef(0);
    const hitListGeneration = useRef(0);
    const hitDetailGeneration = useRef(0);

    const refreshBreakpoints = useCallback(async () => {
        const generation = ++breakpointGeneration.current;
        const content = await callTool('list_debug_breakpoints');
        if (generation !== breakpointGeneration.current || !content?.success) return;
        const next = Array.isArray(content.data) ? content.data : [];
        setBreakpoints(next);
        setSelectedId(current => current && next.some(
            item => item.breakpointId === current,
        ) ? current : '');
    }, [callTool]);

    const loadHit = useCallback(async (hitId) => {
        if (!hitId) return;
        setSelectedHitId(hitId);
        setHitDetail(null);
        setDetailSections(DEFAULT_DETAIL_SECTIONS);
        setBusy('hit-detail');
        const generation = ++hitDetailGeneration.current;
        const content = await callTool('get_debug_hit', { hitId });
        if (generation !== hitDetailGeneration.current) return;
        setBusy(current => current === 'hit-detail' ? '' : current);
        if (content?.success) setHitDetail(content.data);
    }, [callTool]);

    const refreshHits = useCallback(async (breakpointId, selectLatest = false) => {
        if (!breakpointId) {
            setHits([]);
            setSelectedHitId('');
            setHitDetail(null);
            return;
        }
        const generation = ++hitListGeneration.current;
        const content = await callTool('list_debug_hits', { breakpointId });
        if (generation !== hitListGeneration.current || !content?.success) return;
        const next = normalizeHitSummaries(content.data);
        setHits(next);
        const newest = selectLatest ? latestHit(next) : null;
        if (newest) {
            loadHit(newest.hitId);
            return;
        }
        setSelectedHitId(current => {
            if (!current || next.some(item => item.hitId === current)) return current;
            setHitDetail(null);
            ++hitDetailGeneration.current;
            return '';
        });
        if (selectLatest) {
            setSelectedHitId('');
            setHitDetail(null);
            ++hitDetailGeneration.current;
        }
    }, [callTool, loadHit]);

    useEffect(() => {
        if (!visible) return undefined;
        const searchCounter = searchGeneration;
        const inspectCounter = inspectGeneration;
        const breakpointCounter = breakpointGeneration;
        const hitListCounter = hitListGeneration;
        const hitDetailCounter = hitDetailGeneration;
        refreshBreakpoints();
        const reconcile = () => {
            if (document.visibilityState === 'visible') refreshBreakpoints();
        };
        const timer = window.setInterval(reconcile, 15000);
        const clock = window.setInterval(() => setNow(Date.now()), 1000);
        document.addEventListener('visibilitychange', reconcile);
        return () => {
            searchCounter.current++;
            inspectCounter.current++;
            breakpointCounter.current++;
            hitListCounter.current++;
            hitDetailCounter.current++;
            window.clearInterval(timer);
            window.clearInterval(clock);
            document.removeEventListener('visibilitychange', reconcile);
        };
    }, [visible, refreshBreakpoints]);

    useEffect(() => {
        if (visible && readyState === 1) refreshBreakpoints();
    }, [visible, readyState, refreshBreakpoints]);

    useEffect(() => {
        setSelectedHitId('');
        setHitDetail(null);
        ++hitDetailGeneration.current;
        if (selectedId) refreshHits(selectedId, true);
        else setHits([]);
    }, [selectedId, refreshHits]);

    useEffect(() => {
        if (!visible) return undefined;
        const onMessage = (event) => {
            try {
                const raw = event.detail?.data;
                const message = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (message?.type === 'DEBUG_BREAKPOINT' && message.breakpoint) {
                    breakpointGeneration.current++;
                    setBreakpoints(current => mergeBreakpoint(current, message.breakpoint));
                    return;
                }
                if (message?.type !== 'DEBUG_HIT'
                    || message.breakpointId !== selectedId) return;
                callTool('get_debug_breakpoint', {
                    breakpointId: selectedId,
                }).then(content => {
                    if (content?.success) {
                        setBreakpoints(current => mergeBreakpoint(current, content.data));
                    }
                });
                refreshHits(selectedId);
                if (selectedHitId && selectedHitId === message.hitId) {
                    loadHit(selectedHitId);
                }
            } catch {
                // Existing log events are not structured debug events.
            }
        };
        window.addEventListener('swapper-log-message', onMessage);
        return () => window.removeEventListener('swapper-log-message', onMessage);
    }, [callTool, loadHit, refreshHits, selectedHitId, selectedId, visible]);

    useEffect(() => {
        const nativeDialog = dialogRef.current;
        if (!nativeDialog) return;
        if (dialog && !nativeDialog.open) nativeDialog.showModal();
        if (!dialog && nativeDialog.open) nativeDialog.close();
    }, [dialog]);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        const executableLines = new Set(inspection?.executableDisplayLines || []);
        const matching = breakpoints.filter(item =>
            item.className === inspection?.className
            && item.classLoaderHash === inspection?.classLoaderHash
            && (item.status === 'ARMED' || item.status === 'DISARMING'));
        const byLine = new Map(matching.map(item => [item.actualDisplayLine, item]));
        const lines = new Set([
            ...executableLines,
            ...matching.map(item => item.actualDisplayLine),
            ...(focusedLine ? [focusedLine] : []),
        ]);
        const decorations = [...lines].map(line => {
            const active = byLine.get(line);
            return {
                range: {
                    startLineNumber: line,
                    startColumn: 1,
                    endLineNumber: line,
                    endColumn: 1,
                },
                options: {
                    isWholeLine: Boolean(active) || line === focusedLine,
                    className: line === focusedLine
                        ? 'debug-focused-line'
                        : active ? 'debug-active-line' : undefined,
                    glyphMarginClassName: active
                        ? 'debug-breakpoint-glyph'
                        : executableLines.has(line) ? 'debug-executable-glyph' : undefined,
                    glyphMarginHoverMessage: {
                        value: active
                            ? active.status === 'DISARMING'
                                ? 'Breakpoint is being removed'
                                : 'Remove breakpoint'
                            : 'Set non-suspending breakpoint',
                    },
                },
            };
        });
        editor.__debugDecorations = editor.deltaDecorations(
            editor.__debugDecorations || [], decorations);
        if (focusedLine > 0) {
            editor.revealLineInCenter(focusedLine);
            editor.setPosition({ lineNumber: focusedLine, column: 1 });
            editor.focus();
        }
    }, [inspection, breakpoints, focusedLine]);

    useEffect(() => {
        const layoutEditor = () => {
            const editor = editorRef.current;
            if (!editor) return;
            editor.updateOptions({ fontSize: sourceFontSize });
            editor.layout();
        };
        const frame = window.requestAnimationFrame(layoutEditor);
        window.addEventListener('resize', layoutEditor);
        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener('resize', layoutEditor);
        };
    }, [maximized, sourceFontSize]);

    useEffect(() => {
        if (!maximized) return undefined;
        const onKeyDown = (event) => {
            if (event.key !== 'Escape' || dialogRef.current?.open) return;
            event.preventDefault();
            setMaximized('');
            window.setTimeout(() => maximizeTriggerRef.current?.focus(), 0);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [maximized]);

    const inspectTarget = useCallback(async (target) => {
        const generation = ++inspectGeneration.current;
        setBusy('inspect');
        setFocusedLine(0);
        const content = await callTool('inspect_debug_class', {
            className: target.className,
            classLoaderHash: target.classLoaderHash,
        });
        if (generation !== inspectGeneration.current) return null;
        setBusy('');
        if (!content?.success) return null;
        const nextInspection = normalizeInspection(content.data);
        if (!nextInspection) {
            toast.error('Invalid class inspection response.');
            return null;
        }
        setInspection(nextInspection);
        return nextInspection;
    }, [callTool]);

    const openLineAction = useCallback((line) => {
        if (!inspection || !line) return;
        const existing = breakpoints.find(item =>
            item.className === inspection.className
            && item.classLoaderHash === inspection.classLoaderHash
            && item.actualDisplayLine === line
            && (item.status === 'ARMED' || item.status === 'DISARMING'));
        if (existing?.status === 'DISARMING') return;
        setFocusedLine(line);
        if (existing) {
            setDialog({ type: 'remove', breakpoint: existing });
            return;
        }
        setDisplayLine(String(line));
        setAdjustToNearest(false);
        setDialog({ type: 'arm' });
    }, [inspection, breakpoints]);
    gutterActionRef.current = openLineAction;

    const search = async (event) => {
        event.preventDefault();
        const generation = ++searchGeneration.current;
        setBusy('search');
        const content = await callTool('search_loaded_classes', { query, limit: 50 });
        if (generation !== searchGeneration.current) return;
        setBusy('');
        if (content?.success) {
            const results = Array.isArray(content.data) ? content.data : [];
            setClasses(results);
            if (!results.length) toast('No loaded classes match.');
        }
    };

    const closeDialog = () => {
        setDialog(null);
        window.setTimeout(() => editorRef.current?.focus(), 0);
    };

    const armBreakpoint = async (event) => {
        event.preventDefault();
        if (!inspection) return;
        setBusy('arm');
        const content = await callTool('add_debug_breakpoint', {
            className: inspection.className,
            classLoaderHash: inspection.classLoaderHash,
            displayLine: Number(displayLine),
            adjustToNearest,
            ttlSeconds: Number(ttlSeconds),
            maxHits: Number(maxHits),
        });
        setBusy('');
        if (!content?.success) return;
        const item = content.data;
        setBreakpoints(current => mergeBreakpoint(current, item));
        setSelectedId(item.breakpointId);
        setFocusedLine(item.actualDisplayLine);
        closeDialog();
        toast.success(item.outcome === 'ALREADY_EXISTS'
            ? 'Matching breakpoint already exists.'
            : item.lineAdjusted
                ? `Breakpoint adjusted to line ${item.actualDisplayLine}.`
                : `Breakpoint armed at line ${item.actualDisplayLine}.`);
        await refreshBreakpoints();
    };

    const removeBreakpoint = async () => {
        const item = dialog?.breakpoint;
        if (!item) return;
        setBusy(`remove:${item.breakpointId}`);
        const content = await callTool('remove_debug_breakpoint', {
            breakpointId: item.breakpointId,
        });
        setBusy('');
        if (!content?.success) return;
        setBreakpoints(current => mergeBreakpoint(current, content.data));
        closeDialog();
        toast.success('Breakpoint removal started.');
    };

    const locateBreakpoint = async (item) => {
        setSelectedId(item.breakpointId);
        const exactClassOpen = inspection?.className === item.className
            && inspection?.classLoaderHash === item.classLoaderHash;
        if (!exactClassOpen) {
            const next = await inspectTarget({
                className: item.className,
                classLoaderHash: item.classLoaderHash,
            });
            if (!next) return;
        }
        setFocusedLine(item.actualDisplayLine);
        await refreshHits(item.breakpointId, true);
    };

    const clearHistory = async () => {
        setBusy('clear');
        const content = await callTool('clear_debug_history');
        setBusy('');
        if (!content?.success) return;
        await refreshBreakpoints();
        const removed = Number(content.data?.removedCount || 0);
        const retained = Number(content.data?.retainedAttachedCount || 0);
        toast.success(`Cleared ${removed} completed breakpoint${removed === 1 ? '' : 's'}.`
            + (retained ? ` Retained ${retained} attached record${retained === 1 ? '' : 's'}.` : ''));
    };

    const onEditorMount = (editor, monaco) => {
        editorRef.current = editor;
        editor.updateOptions({ glyphMargin: true });
        editor.onMouseDown(event => {
            const line = event.target?.position?.lineNumber;
            const gutterTypes = [
                monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN,
                monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS,
                monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS,
            ];
            if (line && gutterTypes.includes(event.target?.type)) {
                gutterActionRef.current(line);
            }
        });
        editor.addAction({
            id: 'toggle-online-debug-breakpoint',
            label: 'Toggle Online Debug Breakpoint',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.F8],
            run: currentEditor => {
                gutterActionRef.current(currentEditor.getPosition()?.lineNumber);
            },
        });
    };

    const toggleMaximized = (section, trigger) => {
        if (maximized === section) {
            setMaximized('');
            window.setTimeout(() => maximizeTriggerRef.current?.focus(), 0);
            return;
        }
        maximizeTriggerRef.current = trigger;
        setMaximized(section);
    };

    const executable = new Set(inspection?.executableDisplayLines || []);
    const requestedLine = Number(displayLine);
    const lineIsExecutable = executable.has(requestedLine);
    const validNumbers = requestedLine > 0
        && Number(ttlSeconds) >= 60 && Number(ttlSeconds) <= 3600
        && Number(maxHits) >= 1 && Number(maxHits) <= 100;
    const canArm = validNumbers && (lineIsExecutable || adjustToNearest)
        && busy !== 'arm';
    const activeCount = useMemo(
        () => breakpoints.filter(item => item.status === 'ARMED').length,
        [breakpoints],
    );
    const selectedBreakpoint = breakpoints.find(
        item => item.breakpointId === selectedId,
    );
    const allDetailSectionsExpanded = Object.values(detailSections).every(Boolean);
    const toggleAllDetailSections = () => setDetailSections(current => {
        const expanded = Object.values(current).every(Boolean);
        return Object.fromEntries(Object.keys(current).map(key => [key, !expanded]));
    });

    return <main className='debug-workspace m-2 flex h-[calc(100dvh-150px)] min-h-0 min-w-[1560px] flex-row gap-3 overflow-hidden font-sans text-base leading-6 text-slate-800'>
        <Card className={sectionCardClass('classes', maximized)}>
            <section className='flex h-full min-h-0 flex-col' aria-label='Loaded classes'>
                <header className='flex items-start justify-between gap-2 border-b border-slate-300 p-3'>
                    <div className='min-w-0'>
                        <div className='flex flex-wrap items-center gap-2'>
                            <h1 className='text-base font-semibold'>Online Debug</h1>
                            <span className='rounded-full bg-emerald-100 px-2 py-1 text-sm font-semibold text-emerald-800'>
                                non-suspending
                            </span>
                        </div>
                        <p className='mt-1 text-sm leading-6 text-slate-600'>
                            Capture bounded runtime evidence without pausing threads.
                        </p>
                    </div>
                </header>
                <div className='min-h-0 flex-1 overflow-auto p-3'>
                    {readyState !== 1 && <div className='mb-3 rounded bg-amber-50 p-2 text-sm text-amber-900'
                        role='status'>Event stream disconnected. Metadata may be stale.</div>}
                    <form onSubmit={search}>
                        <Input label='Loaded class' value={query} onChange={setQuery}
                            placeholder='com.example.UserService' />
                        <Button type='submit' isDisabled={busy === 'search'} className='mt-2 w-full'>
                            {busy === 'search' ? 'Searching…' : 'Search'}
                        </Button>
                    </form>
                    <div className='mt-3 flex flex-col gap-1' aria-live='polite'>
                        {classes.map(item => {
                            const selected = inspection?.className === item.className
                                && inspection?.classLoaderHash === item.classLoaderHash;
                            return <button key={`${item.className}@${item.classLoaderHash}`}
                                type='button' disabled={!item.modifiable} aria-pressed={selected}
                                className={`overflow-hidden rounded border p-2 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-50 ${selected
                                    ? 'border-blue-400 bg-blue-50 text-blue-950'
                                    : 'border-transparent hover:bg-slate-100'}`}
                                onClick={() => inspectTarget(item)}>
                                <span className='block truncate font-semibold'>{item.className}</span>
                                <small className='mt-1 block truncate text-sm text-slate-600'>
                                    {item.classLoaderName} · {item.classLoaderHash}
                                    {' · '}{item.modifiable ? 'modifiable' : 'read only'}
                                </small>
                            </button>;
                        })}
                    </div>
                </div>
            </section>
        </Card>

        <Card className={sectionCardClass('source', maximized)}>
            <section className='flex h-full min-h-0 flex-col bg-slate-50'
                aria-label='Decompiled source'>
                <header className='flex min-h-14 items-center justify-between gap-3 border-b border-slate-300 bg-white px-3 py-2'>
                    <div className='min-w-0'>
                        <h2 className='block truncate text-base font-semibold'>Decompiled source</h2>
                        <strong className='mt-1 block truncate text-sm font-medium'>
                            {inspection?.className || 'Select loaded class'}
                        </strong>
                        <span className='mt-1 block truncate text-sm text-slate-600'>
                            {inspection
                                ? `${inspection.classLoaderName} · ${inspection.executableDisplayLines.length} executable lines`
                                : 'Search, then select exact loaded class.'}
                        </span>
                    </div>
                    <div className='flex shrink-0 items-center gap-2'>
                        {busy === 'inspect' && <span className='text-sm text-slate-600'>
                            Reading bytecode…
                        </span>}
                        <div className='flex items-center gap-1' role='group'
                            aria-label='Source font size'>
                            <Button type='button' aria-label='Decrease source font size'
                                title='Decrease source font size'
                                isDisabled={sourceFontSize <= MIN_SOURCE_FONT_SIZE}
                                onPress={() => setSourceFontSize(current => Math.max(
                                    MIN_SOURCE_FONT_SIZE, current - 1))}>
                                −
                            </Button>
                            <Button type='button' aria-label='Increase source font size'
                                title='Increase source font size'
                                isDisabled={sourceFontSize >= MAX_SOURCE_FONT_SIZE}
                                onPress={() => setSourceFontSize(current => Math.min(
                                    MAX_SOURCE_FONT_SIZE, current + 1))}>
                                +
                            </Button>
                        </div>
                    </div>
                </header>
                <div className='min-h-0 flex-1 bg-[#1e1e1e]'>
                    <Editor height='100%' language='java' theme='vs-dark'
                        value={inspection?.source || '// Decompiled runtime source appears here.'}
                        onMount={onEditorMount}
                        options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            glyphMargin: true,
                            lineNumbersMinChars: 4,
                            fontSize: sourceFontSize,
                            scrollBeyondLastLine: false,
                            renderLineHighlight: 'line',
                            padding: { top: 12, bottom: 18 },
                        }} />
                </div>
                {inspection?.capabilities?.limitations?.length > 0
                    && <div className='border-t border-slate-300 bg-white p-2 text-sm text-slate-600'>
                        {inspection.capabilities.limitations.join(' · ')}
                    </div>}
            </section>
        </Card>

        <Card className={sectionCardClass('breakpoints', maximized)}>
            <aside className='flex h-full min-h-0 flex-col' aria-label='Breakpoints'>
                <header className='flex items-center justify-between gap-2 border-b border-slate-300 px-3 py-2'>
                    <div className='min-w-0'>
                        <div className='flex items-baseline gap-2'>
                            <h2 className='text-base font-semibold'>Breakpoints</h2>
                            <span className='text-sm text-slate-600'>{activeCount} armed</span>
                        </div>
                        <p className='mt-1 text-sm text-slate-600'>Select breakpoint, then hit.</p>
                    </div>
                    <div className='flex shrink-0 items-center gap-1'>
                        <Button className='bg-[var(--w-red)] hover:bg-[var(--w-red-dark)] hover:text-white'
                            onPress={clearHistory} isDisabled={busy === 'clear'}>
                            {busy === 'clear' ? 'Clearing…' : 'Clear'}
                        </Button>
                        <MaximizeButton section='breakpoints' maximized={maximized}
                            onToggle={toggleMaximized} label='Breakpoints' />
                    </div>
                </header>

                <div className='max-h-[32%] min-h-[110px] flex-none overflow-auto border-b border-slate-300 px-2 py-2'>
                    {breakpoints.length === 0 && <div className='p-3 text-sm text-slate-600'>
                        <strong className='block text-slate-800'>No breakpoints</strong>
                        <span className='mt-1 block'>Click any source gutter line to add one.</span>
                    </div>}
                    {breakpoints.map(item => <button type='button' key={item.breakpointId}
                        aria-pressed={selectedId === item.breakpointId}
                        onClick={() => locateBreakpoint(item)}
                        className={`mt-1 grid w-full grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-2 rounded border p-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${selectedId === item.breakpointId
                            ? 'border-blue-400 bg-blue-50' : 'border-transparent hover:bg-slate-100'}`}>
                        <span className={`h-2 w-2 rounded-full ${statusColor(item.status)}`}
                            aria-hidden='true' />
                        <span className='min-w-0'>
                            <strong className='block truncate text-sm'>
                                {shortClass(item.className)}:{item.actualDisplayLine}
                            </strong>
                            <small className='mt-1 block truncate text-sm text-slate-600'>
                                {item.methodName} · {item.status}
                                {' · '}{item.hitCount}/{item.maxHits} hits
                            </small>
                            {(Number(item.evictedHitCount) > 0 || Number(item.captureErrorCount) > 0)
                                && <small className='mt-1 block text-sm text-amber-900'>
                                    {Number(item.evictedHitCount) > 0
                                        ? `${item.evictedHitCount} evicted` : ''}
                                    {Number(item.evictedHitCount) > 0
                                        && Number(item.captureErrorCount) > 0 ? ' · ' : ''}
                                    {Number(item.captureErrorCount) > 0
                                        ? `${item.captureErrorCount} capture failed` : ''}
                                </small>}
                        </span>
                        <time className='text-sm text-slate-600'>
                            {item.status === 'ARMED'
                                ? countdown(item.expiresAt - now)
                                : item.completionReason || item.status}
                        </time>
                    </button>)}
                </div>

                <div className='max-h-[27%] min-h-[96px] flex-none overflow-auto border-b border-slate-300 px-2 py-2'>
                    <div className='mb-1 flex items-center justify-between gap-2 px-1 text-sm'>
                        <strong>Hits {selectedBreakpoint
                            ? `(${selectedBreakpoint.retainedHitCount || 0} retained)` : ''}</strong>
                        {selectedBreakpoint && <span className='text-sm text-slate-500'>newest first</span>}
                    </div>
                    {!selectedBreakpoint && <p className='p-2 text-sm text-slate-600'>
                        Select breakpoint to view retained hits.
                    </p>}
                    {selectedBreakpoint && hits.length === 0
                        && <p className='p-2 text-sm text-slate-600'>
                            {Number(selectedBreakpoint.evictedHitCount) > 0
                                ? 'No retained detail. Older hits were evicted by global budget.'
                                : 'Waiting for first hit.'}
                        </p>}
                    {hits.map(hit => {
                        const selected = selectedHitId === hit.hitId;
                        return <div className='mt-1 flex w-full items-center gap-1' key={hit.hitId}>
                            <button type='button'
                                aria-pressed={selected}
                                onClick={() => loadHit(hit.hitId)}
                                className={`grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-1.5 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${selected
                                    ? 'bg-blue-100 text-blue-950' : 'hover:bg-slate-100'}`}>
                                <strong>#{hit.sequence}</strong>
                                <span className='min-w-0 truncate'>
                                    {hit.threadName || 'unknown thread'}
                                    {hit.captureError ? ' · capture failed' : ''}
                                    {hit.truncated ? ' · truncated' : ''}
                                </span>
                                <span className={returnStatusClass(hit.breakpointReturnStatus
                                    && hit.breakpointReturnStatus !== 'NOT_AT_RETURN'
                                    ? hit.breakpointReturnStatus : hit.returnStatus)}>
                                    {hit.breakpointReturnStatus
                                    && hit.breakpointReturnStatus !== 'NOT_AT_RETURN'
                                        ? hit.breakpointReturnStatus : hit.returnStatus || 'PENDING'}
                                </span>
                            </button>
                            {selected && <CaptureSectionsButton expanded={allDetailSectionsExpanded}
                                onToggle={toggleAllDetailSections} />}
                        </div>;
                    })}
                </div>

                <div className='min-h-0 flex-1 overflow-auto p-2'>
                    <h3 className='mb-2 px-1 text-base font-semibold'>Hit detail</h3>
                    <DebugHitDetails detail={hitDetail} loading={busy === 'hit-detail'}
                        sections={detailSections} onSectionsChange={setDetailSections} />
                </div>
            </aside>
        </Card>

        <dialog ref={dialogRef} aria-labelledby='debug-dialog-title'
            className='debug-dialog w-[min(520px,calc(100vw-32px))] rounded-lg border-0 p-0 shadow-2xl'
            onCancel={(event) => {
                event.preventDefault();
                closeDialog();
            }}
            onClose={() => {
                if (dialog) setDialog(null);
                window.setTimeout(() => editorRef.current?.focus(), 0);
            }}>
            {dialog?.type === 'arm' && <form onSubmit={armBreakpoint} className='p-5'>
                <h2 id='debug-dialog-title' className='text-lg font-semibold'>Arm breakpoint</h2>
                <p className='mt-1 text-sm text-slate-600'>
                    Counts hits and captures bounded shallow values without pausing target thread.
                </p>
                <div className='mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3'>
                    <Input label='Display line' type='number' min={1} value={displayLine}
                        onChange={setDisplayLine} autoFocus />
                    <Input label='TTL seconds' type='number' min={60} max={3600}
                        value={ttlSeconds} onChange={setTtlSeconds} />
                    <Input label='Max hits' type='number' min={1} max={100}
                        value={maxHits} onChange={setMaxHits} />
                </div>
                <div className='mt-4 flex items-center gap-2'>
                    <Checkbox isSelected={adjustToNearest} onChange={setAdjustToNearest}>
                        Adjust inside method
                    </Checkbox>
                    <AdjustHelp portalTarget={dialogRef.current} />
                </div>
                {!lineIsExecutable && !adjustToNearest
                    && <p className='mt-3 rounded bg-amber-50 p-2 text-sm text-amber-900'
                        role='status'>
                        Line {requestedLine || '—'} has no executable bytecode. Enable Adjust inside method to arm it.
                    </p>}
                <div className='mt-5 flex justify-end gap-2'>
                    <Button type='button' onPress={closeDialog}>Cancel</Button>
                    <Button type='submit' isDisabled={!canArm}>
                        {busy === 'arm' ? 'Arming…' : 'Arm'}
                    </Button>
                </div>
            </form>}
            {dialog?.type === 'remove' && <div className='p-5'>
                <h2 id='debug-dialog-title' className='text-lg font-semibold'>Remove breakpoint?</h2>
                <p className='mt-2 text-sm text-slate-700'>
                    {dialog.breakpoint.className}:{dialog.breakpoint.actualDisplayLine}
                </p>
                <div className='mt-5 flex justify-end gap-2'>
                    <Button type='button' onPress={closeDialog}>Cancel</Button>
                    <Button type='button' onPress={removeBreakpoint}
                        isDisabled={busy === `remove:${dialog.breakpoint.breakpointId}`}>
                        {busy === `remove:${dialog.breakpoint.breakpointId}`
                            ? 'Removing…' : 'Remove'}
                    </Button>
                </div>
            </div>}
        </dialog>
    </main>;
}

function MaximizeButton({ section, maximized, onToggle, label }) {
    const isMaximized = maximized === section;
    return <Button type='button' aria-label={`${isMaximized ? 'Restore' : 'Maximize'} ${label}`}
        title={`${isMaximized ? 'Restore' : 'Maximize'} ${label}`}
        aria-pressed={isMaximized}
        className='!m-0 !flex !h-8 !w-8 !items-center !justify-center !p-1 !text-sm'
        onPress={() => onToggle(section, document.activeElement)}>
        {isMaximized
            ? <svg aria-hidden='true' viewBox='0 0 20 20' className='h-4 w-4 fill-none stroke-current' strokeWidth='1.7'>
                <path d='M7 3v4H3M13 3v4h4M7 17v-4H3M13 17v-4h4' />
            </svg>
            : <svg aria-hidden='true' viewBox='0 0 20 20' className='h-4 w-4 fill-none stroke-current' strokeWidth='1.7'>
                <path d='M7 3H3v4M13 3h4v4M7 17H3v-4M13 17h4v-4' />
            </svg>}
    </Button>;
}

function CaptureSectionsButton({ expanded, onToggle }) {
    return <button type='button' className='details-trigger-button shrink-0'
        aria-label={`${expanded ? 'Collapse' : 'Expand'} all capture sections`}
        aria-pressed={expanded}
        title={`${expanded ? 'Collapse' : 'Expand'} all capture sections`}
        onClick={onToggle}>
        <svg width='25px'
            style={{
                transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: '0.4s',
            }}
            viewBox='0 0 512 512' className='arrow' aria-hidden='true'>
            <circle stroke='black' cx='256' cy='256' r='240' />
            <path strokeWidth='2' fill='var(--w-indigo)' d='M464 256c0-114.87-93.13-208-208-208S48 141.13 48 256s93.13 208 208 208 208-93.13 208-208zm-99.73-44L256 342.09 147.73 212z' />
        </svg>
    </button>;
}

function AdjustHelp({ portalTarget }) {
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const buttonRef = useRef(null);
    const tooltipId = 'adjust-inside-method-help';
    const open = hovered || focused;

    useEffect(() => {
        if (!open) return undefined;
        const updatePosition = () => {
            const rect = buttonRef.current?.getBoundingClientRect();
            if (!rect) return;
            setPosition({
                top: rect.bottom + 8,
                left: Math.min(rect.left, window.innerWidth - 376),
            });
        };
        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [open]);

    return <>
        <button ref={buttonRef} type='button' aria-label='About Adjust inside method'
            aria-describedby={tooltipId}
            className='inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-500 text-sm font-bold text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700'
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}>
            ?
        </button>
        {createPortal(<div id={tooltipId} role='tooltip' hidden={!open}
            aria-hidden={!open}
            className='pointer-events-none fixed z-[100] max-w-[min(360px,calc(100vw-24px))] rounded border border-slate-400 bg-white p-3 text-left text-sm leading-5 text-slate-800 shadow-xl'
            style={{ top: position.top, left: Math.max(12, position.left) }}>
            {ADJUST_HELP}
        </div>, portalTarget || document.body)}
    </>;
}

function sectionCardClass(section, maximized) {
    const width = maximized === section ? 'w-auto' : {
        classes: 'flex-[1_1_0%]',
        source: 'flex-[2_2_0%]',
        breakpoints: 'flex-[1_1_0%]',
    }[section];
    const height = maximized === section ? 'h-[calc(100dvh-16px)]' : 'h-full';
    const base = `debug-section-card min-h-0 min-w-0 overflow-hidden bg-white p-0 ${width} ${height}`;
    if (maximized === section) {
        return `${base} fixed inset-2 z-50 m-0`;
    }
    return base;
}

function shortClass(name = '') {
    return name.slice(name.lastIndexOf('.') + 1);
}

function countdown(milliseconds) {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function statusColor(status) {
    return {
        ARMED: 'bg-emerald-700',
        DISARMING: 'bg-amber-600',
        ERROR: 'bg-red-700',
        DISARMED: 'bg-slate-500',
    }[status] || 'bg-slate-500';
}

function returnStatusClass(status) {
    return {
        RETURNED: 'font-semibold text-emerald-800',
        VOID: 'font-semibold text-emerald-800',
        THREW: 'font-semibold text-red-800',
        SNAPSHOT: 'font-semibold text-blue-800',
        PENDING: 'font-semibold text-blue-800',
    }[status] || 'font-semibold text-slate-600';
}
