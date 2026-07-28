import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInspection } from './inspectionModel.js';

test('normalizes incomplete inspection collections from MCP', () => {
    const inspection = normalizeInspection({
        className: 'reproducer.target.NormalWatchTarget',
        classLoaderHash: '5910e440',
        source: 'class NormalWatchTarget {}',
    });

    assert.deepEqual(inspection.executableDisplayLines, []);
    assert.deepEqual(inspection.ambiguousDisplayLines, []);
    assert.deepEqual(inspection.methods, []);
    assert.deepEqual(inspection.capabilities, {
        lineBreakpoints: false,
        limitations: [],
    });
});

test('preserves valid inspection capabilities and collections', () => {
    const inspection = normalizeInspection({
        executableDisplayLines: [16, 20],
        ambiguousDisplayLines: [22],
        methods: [{ name: 'echo' }],
        capabilities: {
            lineBreakpoints: true,
            limitations: ['constructors unsupported'],
        },
    });

    assert.deepEqual(inspection.executableDisplayLines, [16, 20]);
    assert.deepEqual(inspection.ambiguousDisplayLines, [22]);
    assert.deepEqual(inspection.methods, [{ name: 'echo' }]);
    assert.deepEqual(inspection.capabilities, {
        lineBreakpoints: true,
        limitations: ['constructors unsupported'],
    });
});

test('rejects non-object inspection payloads', () => {
    assert.equal(normalizeInspection(null), null);
    assert.equal(normalizeInspection([]), null);
    assert.equal(normalizeInspection('invalid'), null);
});
