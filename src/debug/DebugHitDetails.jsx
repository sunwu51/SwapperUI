import { Details } from '@sunwu51/camel-ui';
import { useEffect, useMemo, useState } from 'react';
import {
    filterCapturedValues,
    formatCapturedValue,
    normalizeCapturedValue,
    visibleStackFrames,
} from './hitModel';

const MAX_OBJECT_DEPTH = 3;
export default function DebugHitDetails({
    detail, loading, sections, onSectionsChange,
}) {
    const [stackExpanded, setStackExpanded] = useState(false);

    useEffect(() => {
        setStackExpanded(false);
    }, [detail?.hitId]);

    if (loading) {
        return <div className='p-3 text-sm text-slate-600' role='status'>
            Loading hit detail…
        </div>;
    }
    if (!detail) {
        return <div className='p-3 text-sm leading-5 text-slate-600'>
            Select a retained hit to load its captured values.
        </div>;
    }

    const stack = Array.isArray(detail.callStack) ? detail.callStack : [];
    const visibleStack = visibleStackFrames(stack, stackExpanded);
    const returnState = detail.breakpointReturn || detail.return || { status: 'PENDING' };
    const setSection = key => value => onSectionsChange(current => ({
        ...current,
        [key]: value,
    }));

    return <div id='debug-hit-detail-sections' key={detail.hitId}
        className='swapper-debug-capture min-w-0 text-base'>
        <div>
            <div className='mb-2 flex flex-wrap items-center gap-2 px-1 text-sm text-slate-600'>
                <span>Thread {detail.thread?.name || 'unknown'} #{detail.thread?.id ?? '—'}</span>
                <span aria-hidden='true'>·</span>
                <span>{formatTimestamp(detail.capturedAt)}</span>
                {detail.asynchronousShallowSnapshot
                    && <span className='rounded bg-blue-50 px-1.5 py-0.5 text-sm text-blue-800'>
                        async shallow snapshot
                    </span>}
            </div>

            {detail.captureError && <StatusMessage tone='error'>
                Capture failed: {detail.captureError}
            </StatusMessage>}
            {detail.truncated && <StatusMessage tone='warning'>
                Detail exceeded capture limit. Truncated values are marked below.
            </StatusMessage>}

            <Details title='Parameters' isSelected={sections.parameters}
                onChange={setSection('parameters')}
                titleClassName='font-semibold text-[var(--w-blue-dark)]'>
                <CapturedValues values={detail.parameters} empty='No parameters.' />
            </Details>
            <Details title='Breakpoint Return / Throw' isSelected={sections.breakpointReturn}
                onChange={setSection('breakpointReturn')}
                titleClassName='font-semibold text-[var(--w-blue-dark)]'>
                <ReturnValue state={returnState} />
            </Details>
            <Details title='Instance fields' isSelected={sections.instanceFields}
                onChange={setSection('instanceFields')}
                titleClassName='font-semibold text-[var(--w-blue-dark)]'>
                <CapturedValues values={detail.instanceFields} empty='No instance fields.' />
            </Details>
            <Details title='Static fields' isSelected={sections.staticFields}
                onChange={setSection('staticFields')}
                titleClassName='font-semibold text-[var(--w-blue-dark)]'>
                <CapturedValues values={detail.staticFields} empty='No static fields.' />
            </Details>
            <Details title='Method Parameters & Method Return / Throw' isSelected={sections.method}
                onChange={setSection('method')}
                titleClassName='font-semibold text-[var(--w-blue-dark)]'>
                <MethodInputOutput parameters={detail.methodParameters || detail.parameters}
                    returnState={detail.return} />
            </Details>
            <Details title={`Call stack (${stack.length})`} isSelected={sections.callStack}
                onChange={setSection('callStack')}
                titleClassName='font-semibold text-[var(--w-blue-dark)]'>
                <ol className='mt-2 min-w-0 space-y-1 font-mono text-sm leading-6'>
                    {visibleStack.map((frame, index) => <li key={`${index}-${frame.className}-${frame.lineNumber}`}
                        className='grid grid-cols-[24px_minmax(0,1fr)] gap-1 rounded bg-slate-50 px-2 py-1'>
                        <span className='text-right text-slate-400'>{index + 1}</span>
                        <span className='min-w-0 break-all'>
                            {frame.className}.{frame.methodName}
                            <span className='text-slate-500'>
                                {' '}({frame.fileName || 'Unknown Source'}
                                {Number(frame.lineNumber) >= 0 ? `:${frame.lineNumber}` : ''})
                            </span>
                        </span>
                    </li>)}
                </ol>
                {stack.length > 8 && <button type='button'
                    className='mt-2 rounded px-2 py-1 text-sm font-semibold text-blue-800 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700'
                    onClick={() => setStackExpanded(current => !current)}>
                    {stackExpanded ? 'Show less' : `Show all ${stack.length} frames`}
                </button>}
            </Details>
        </div>
    </div>;
}

function MethodInputOutput({ parameters, returnState }) {
    return <div className='min-w-0 divide-y divide-slate-200'>
        <section className='pb-3' aria-labelledby='debug-method-parameters'>
            <h4 id='debug-method-parameters'
                className='mt-2 text-sm font-semibold text-slate-700'>
                Method parameters
            </h4>
            <CapturedValues values={parameters} empty='No method parameters.'
                />
        </section>
        <section className='pt-3' aria-labelledby='debug-method-return'>
            <h4 id='debug-method-return'
                className='text-sm font-semibold text-slate-700'>
                Method return / throw
            </h4>
            <ReturnValue state={returnState || { status: 'PENDING' }} />
        </section>
    </div>;
}

function CapturedValues({ values, empty }) {
    const [view, setView] = useState('object');
    const [filter, setFilter] = useState('');
    const filteredValues = useMemo(
        () => filterCapturedValues(values, filter),
        [values, filter],
    );
    const hasValues = Array.isArray(values) && values.length > 0;

    return <div className='min-w-0'>
        <div className='mt-2 flex flex-wrap items-center gap-1.5'>
            <div className='flex rounded border border-slate-300 bg-white p-0.5' role='group'
                aria-label='Captured value view'>
                {['object', 'json'].map(option => <button key={option} type='button'
                    aria-pressed={view === option}
                    className={`rounded px-2 py-0.5 text-sm font-semibold ${view === option
                        ? 'bg-blue-100 text-blue-900' : 'text-slate-600 hover:bg-slate-100'}`}
                    onClick={() => setView(option)}>
                    {option === 'object' ? 'Object' : 'JSON'}
                </button>)}
            </div>
            <label className='min-w-[120px] flex-1'>
                <span className='sr-only'>Filter captured values</span>
                <input type='search' value={filter} onChange={event => setFilter(event.target.value)}
                    placeholder='Filter fields or values'
                    className='w-full rounded border border-slate-300 px-2 py-1 text-sm leading-5 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600' />
            </label>
            {filter && <button type='button' aria-label='Clear captured value filter'
                className='rounded border border-slate-300 px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700'
                onClick={() => setFilter('')}>
                Clear
            </button>}
        </div>
        {!hasValues && <p className='px-1 py-2 text-slate-500'>{empty}</p>}
        {hasValues && filteredValues.length === 0 && <p className='px-1 py-2 text-slate-500' role='status'>
            No captured values match “{filter}”.
        </p>}
        {filteredValues.length > 0 && view === 'json'
            && <div className='mt-2 space-y-2'>
                {filteredValues.map((entry, index) => <JsonEntry key={`${entry.name}-${index}`}
                    entry={entry} query={filter} />)}
            </div>}
        {filteredValues.length > 0 && view === 'object'
            && <dl className='mt-2 space-y-2'>
                {filteredValues.map((entry, index) => <ObjectEntry key={`${entry.name}-${index}`}
                    entry={entry} query={filter} />)}
            </dl>}
    </div>;
}

function ObjectEntry({ entry, query }) {
    return <div className='min-w-0 rounded bg-slate-50 px-2 py-1.5'>
        <dt className='flex min-w-0 flex-wrap items-baseline gap-x-2'>
            <strong className='break-all text-slate-800'>
                <HighlightText value={entry.name || '(unnamed)'} query={query} />
            </strong>
            <span className='break-all text-sm text-slate-500'>
                <HighlightText value={entry.declaredType || 'unknown type'} query={query} />
                {entry.declaringClass && <><span> · </span>
                    <HighlightText value={entry.declaringClass} query={query} /></>}
            </span>
        </dt>
        {entry.error
            ? <dd className='mt-1 break-words text-red-800'>
                <span className='font-semibold'>Inaccessible:</span> {entry.error}
            </dd>
            : <dd><CapturedValueNode value={entry.value} depth={0} query={query} /></dd>}
    </div>;
}

function JsonEntry({ entry, query }) {
    return <div className='min-w-0 rounded bg-slate-50 px-2 py-1.5'>
        <div className='flex min-w-0 flex-wrap items-baseline gap-x-2'>
            <strong className='break-all text-slate-800'>
                <HighlightText value={entry.name || '(unnamed)'} query={query} />
            </strong>
            <span className='break-all text-sm text-slate-500'>
                <HighlightText value={entry.declaredType || 'unknown type'} query={query} />
            </span>
        </div>
        {entry.error
            ? <div className='mt-1 break-words text-red-800'>
                <span className='font-semibold'>Inaccessible:</span> {entry.error}
            </div>
            : <pre className='mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-900 p-2 font-mono text-sm leading-6 text-slate-100'>
                <HighlightText value={formatCapturedValue(entry.value)} query={query} />
            </pre>}
    </div>;
}

function CapturedValueNode({ value, depth, query = '' }) {
    const node = normalizeCapturedValue(value);
    const expandable = node.kind === 'OBJECT' || node.kind === 'ARRAY';
    const depthLimited = expandable && depth >= MAX_OBJECT_DEPTH;
    const [expanded, setExpanded] = useState(Boolean(query) || depth < 1);

    useEffect(() => {
        if (query) setExpanded(true);
    }, [query]);

    return <div className='mt-1 min-w-0'>
        <div className='flex min-w-0 items-start gap-1'>
            {expandable && !depthLimited
                ? <button type='button' aria-expanded={expanded}
                    aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.kind.toLocaleLowerCase()}`}
                    className='mt-0.5 h-5 w-5 shrink-0 rounded text-slate-600 hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700'
                    onClick={() => setExpanded(current => !current)}>
                    {expanded ? '▾' : '▸'}
                </button>
                : <span className='w-5 shrink-0' aria-hidden='true' />}
            <span className='min-w-0 break-words text-slate-700'>
                <ValueSummary node={node} query={query} />
                {depthLimited && <span className='ml-1 rounded bg-slate-200 px-1 text-sm text-slate-600'>
                    depth limit
                </span>}
            </span>
        </div>
        {expandable && expanded && !depthLimited
            && <div className='ml-5 border-l border-slate-300 pl-2'>
                {node.kind === 'OBJECT'
                    ? node.fields.map((entry, index) => <ObjectChild key={`${entry.name}-${index}`}
                        entry={entry} depth={depth + 1} query={query} />)
                    : node.items.map((item, index) => <div key={index} className='min-w-0 py-0.5'>
                        <span className='mr-1 text-sm text-slate-500'>[{item.arrayIndex ?? index}]</span>
                        <CapturedValueNode value={item} depth={depth + 1} />
                    </div>)}
                {node.truncated && <div className='py-1 text-sm font-semibold text-amber-800'>
                    truncated
                </div>}
            </div>}
    </div>;
}

function ObjectChild({ entry, depth, query }) {
    return <div className='min-w-0 py-0.5'>
        <div className='flex min-w-0 flex-wrap items-baseline gap-x-2'>
            <strong className='break-all text-slate-800'>
                <HighlightText value={entry.name || '(unnamed)'} query={query} />
            </strong>
            <span className='break-all text-sm text-slate-500'>
                <HighlightText value={entry.declaredType || 'unknown type'} query={query} />
            </span>
        </div>
        {entry.error
            ? <div className='mt-0.5 break-words text-sm text-red-800'>
                Inaccessible: {entry.error}
            </div>
            : <CapturedValueNode value={entry.value} depth={depth} query={query} />}
    </div>;
}

function ValueSummary({ node, query }) {
    if (node.kind === 'NULL') return <span className='font-mono'>null</span>;
    if (node.kind === 'OBJECT') {
        return <><span className='font-semibold'>object</span>
            <span className='text-slate-500'> ({node.fields.length} fields{node.type
                && <><span> · </span><HighlightText value={node.type} query={query} /></>})</span></>;
    }
    if (node.kind === 'ARRAY') {
        const count = node.items.length;
        const capacity = node.length != null && node.length !== count ? ` / ${node.length}` : '';
        return <><span className='font-semibold'>array</span>
            <span className='text-slate-500'> ({count}{capacity} populated items{node.type
                && <><span> · </span><HighlightText value={node.type} query={query} /></>})</span></>;
    }
    if (node.kind === 'TRUNCATED') {
        return <span className='font-semibold text-amber-800'>truncated{node.type
            && <><span> · </span><HighlightText value={node.type} query={query} /></>}</span>;
    }
    if (node.kind === 'REFERENCE') {
        return <span className='font-semibold text-amber-800'>
            {node.cycle ? 'cycle' : 'reference'}{node.type
                && <><span> · </span><HighlightText value={node.type} query={query} /></>}
        </span>;
    }
    return <><span className='font-mono break-words'>
        <HighlightText value={formatScalar(node.value)} query={query} />
    </span>
        {node.type && <span className='ml-1 text-sm text-slate-500'>· <HighlightText value={node.type} query={query} /></span>}</>;
}

function ReturnValue({ state }) {
    if (state.status === 'SNAPSHOT') {
        return <div className='mt-2'>
            {state.message && <StatusMessage tone='warning'>{state.message}</StatusMessage>}
            <CapturedValues values={state.value?.fields}
                empty='No local return variables captured.' />
        </div>;
    }
    if (state.status === 'NOT_AT_RETURN') {
        return <StatusMessage tone='pending'>
            Current breakpoint is not on a return or throw instruction.
        </StatusMessage>;
    }
    if (state.status === 'PENDING') {
        return <StatusMessage tone='pending'>
            Method has not exited. Final return or exception is pending.
        </StatusMessage>;
    }
    if (state.status === 'VOID') {
        return <div className='mt-2 rounded bg-slate-50 px-2 py-2 font-mono'>void</div>;
    }
    if (state.status === 'THREW') {
        return <div className='mt-2'>
            <div className='mb-1 font-semibold text-red-800'>THREW</div>
            <CapturedValues values={[{
                name: 'exception',
                declaredType: state.exception?.type,
                value: state.exception,
            }]} empty='No exception value.' />
        </div>;
    }
    return <div className='mt-2'>
        <div className='mb-1 font-semibold text-emerald-800'>RETURNED</div>
        <CapturedValues values={[{
            name: 'return',
            declaredType: state.value?.type,
            value: state.value,
        }]} empty='No return value.' />
    </div>;
}

function StatusMessage({ children, tone }) {
    const toneClass = {
        error: 'bg-red-50 text-red-900',
        warning: 'bg-amber-50 text-amber-900',
        pending: 'bg-blue-50 text-blue-900',
    }[tone] || 'bg-slate-50 text-slate-800';
    return <p className={`mb-2 rounded px-2 py-1.5 leading-5 ${toneClass}`} role='status'>
        {children}
    </p>;
}

function formatScalar(value) {
    if (typeof value === 'string') return JSON.stringify(value);
    if (value === undefined) return 'undefined';
    if (typeof value === 'object') return formatCapturedValue(value);
    return String(value);
}

function HighlightText({ value, query }) {
    const text = String(value ?? '');
    const needle = String(query || '').trim();
    if (!needle) return text;
    const pattern = new RegExp(`(${escapeRegExp(needle)})`, 'ig');
    return text.split(pattern).map((part, index) => part.toLocaleLowerCase()
        === needle.toLocaleLowerCase()
        ? <mark key={`${part}-${index}`} className='rounded bg-yellow-200 px-0.5 text-inherit'>
            {part}
        </mark>
        : part);
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatTimestamp(value) {
    if (!value) return 'unknown time';
    return new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
    }).format(new Date(value));
}
