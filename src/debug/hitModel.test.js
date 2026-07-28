import test from 'node:test';
import assert from 'node:assert/strict';
import {
    filterCapturedValues,
    formatCapturedValue,
    latestHit,
    limitCapturedValueDepth,
    mergeBreakpoint,
    normalizeCapturedValue,
    normalizeHitSummaries,
    visibleStackFrames,
} from './hitModel.js';

test('normalizes retained hit summaries newest first', () => {
    const summaries = normalizeHitSummaries([
        { hitId: 'old', sequence: 1 },
        null,
        { hitId: 'new', sequence: 3 },
    ]);

    assert.deepEqual(summaries.map(item => item.hitId), ['new', 'old']);
});

test('deduplicates repeated hit summaries by hit id', () => {
    const summaries = normalizeHitSummaries([
        { hitId: 'same', sequence: 2, threadName: 'first' },
        { hitId: 'same', sequence: 2, threadName: 'duplicate' },
    ]);

    assert.deepEqual(summaries.map(item => item.hitId), ['same']);
});

test('stack frame disclosure defaults to eight frames', () => {
    const frames = Array.from({ length: 12 }, (_, index) => ({ lineNumber: index }));

    assert.equal(visibleStackFrames(frames, false).length, 8);
    assert.equal(visibleStackFrames(frames, true).length, 12);
});

test('merges breakpoint updates without duplicates', () => {
    const merged = mergeBreakpoint(
        [{ breakpointId: 'one', hitCount: 0 }, { breakpointId: 'two' }],
        { breakpointId: 'one', hitCount: 1 },
    );

    assert.equal(merged.length, 2);
    assert.equal(merged[0].hitCount, 1);
});

test('renders structured captured values without custom object coercion', () => {
    assert.match(formatCapturedValue({ kind: 'SCALAR', value: 4 }), /"value": 4/);
    assert.equal(formatCapturedValue(null), 'unavailable');
});

test('normalizes typed object and array values while hiding wrapper details from model consumers', () => {
    const value = normalizeCapturedValue({
        kind: 'OBJECT',
        type: 'demo.Root',
        fields: [{
            name: 'children',
            declaredType: 'demo.Child[]',
            value: {
                kind: 'ARRAY',
                type: '[Ldemo.Child;',
                length: 1,
                items: [{
                    kind: 'OBJECT',
                    type: 'demo.Child',
                    fields: [],
                }],
            },
        }],
    });

    assert.equal(value.kind, 'OBJECT');
    assert.equal(value.fields[0].value.kind, 'ARRAY');
    assert.equal(value.fields[0].value.items[0].type, 'demo.Child');
    assert.equal(value.kind === 'OBJECT' && 'value' in value, false);
});

test('normalizes breakpoint snapshots as expandable objects', () => {
    const snapshot = normalizeCapturedValue({
        kind: 'OBJECT',
        type: 'breakpoint-line',
        fields: [{
            name: 'count',
            declaredType: 'int',
            value: { kind: 'SCALAR', type: 'java.lang.Integer', value: 3 },
        }],
    });

    assert.equal(snapshot.kind, 'OBJECT');
    assert.equal(snapshot.type, 'breakpoint-line');
    assert.equal(snapshot.fields[0].name, 'count');
    assert.equal(snapshot.fields[0].value.value, 3);
});

test('omits null array slots but preserves original populated indexes', () => {
    const value = normalizeCapturedValue({
        kind: 'ARRAY',
        type: '[Ljava.lang.String;',
        length: 4,
        items: [
            { kind: 'NULL' },
            { kind: 'SCALAR', type: 'java.lang.String', value: 'inserted' },
            { kind: 'NULL' },
            { kind: 'SCALAR', type: 'java.lang.String', value: 'later' },
        ],
    });

    assert.equal(value.items.length, 2);
    assert.deepEqual(value.items.map(item => item.arrayIndex), [1, 3]);
    assert.equal(value.length, 4);
});

test('limits object view traversal to three nested levels', () => {
    const nested = depth => depth === 0 ? {
        kind: 'OBJECT',
        type: `Level${depth}`,
        fields: [{ name: 'next', value: nested(depth + 1) }],
    } : depth === 4 ? { kind: 'SCALAR', type: 'int', value: 1 } : {
        kind: 'OBJECT',
        type: `Level${depth}`,
        fields: [{ name: 'next', value: nested(depth + 1) }],
    };
    const limited = limitCapturedValueDepth(nested(0), 3);

    const depthThree = limited.fields[0].value.fields[0].value.fields[0].value;
    assert.equal(depthThree.fields.length, 0);
    assert.equal(depthThree.depthLimited, true);
});

test('filters field names and scalar values, retaining parent path', () => {
    const values = [{
        name: 'user',
        declaredType: 'demo.User',
        value: {
            kind: 'OBJECT',
            type: 'demo.User',
            fields: [
                { name: 'name', declaredType: 'java.lang.String', value: { kind: 'SCALAR', type: 'java.lang.String', value: 'Ada' } },
                { name: 'age', declaredType: 'int', value: { kind: 'SCALAR', type: 'int', value: 37 } },
            ],
        },
    }];

    const byValue = filterCapturedValues(values, 'ada');
    assert.deepEqual(byValue.map(item => item.name), ['user']);
    assert.deepEqual(byValue[0].value.fields.map(item => item.name), ['name']);

    const byName = filterCapturedValues(values, 'AGE');
    assert.deepEqual(byName[0].value.fields.map(item => item.name), ['age']);
});

test('filters arrays and reports no match with an empty result', () => {
    const values = [{
        name: 'items',
        value: {
            kind: 'ARRAY',
            length: 2,
            items: [
                { kind: 'SCALAR', type: 'java.lang.String', value: 'keep me' },
                { kind: 'SCALAR', type: 'java.lang.String', value: 'other' },
            ],
        },
    }];

    const filtered = filterCapturedValues(values, 'KEEP');
    assert.equal(filtered[0].value.items.length, 1);
    assert.equal(filtered[0].value.items[0].arrayIndex, 0);
    assert.deepEqual(filterCapturedValues(values, 'missing'), []);
});

test('selects retained hit with greatest sequence', () => {
    assert.equal(latestHit([
        { hitId: 'two', sequence: 2 },
        { hitId: 'five', sequence: 5 },
    ]).hitId, 'five');
    assert.equal(latestHit([]), null);
});
