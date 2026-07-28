export const CAPTURED_VALUE_KINDS = new Set([
    'SCALAR',
    'NULL',
    'OBJECT',
    'ARRAY',
    'REFERENCE',
    'TRUNCATED',
    'CLASS',
]);

export function normalizeHitSummaries(payload) {
    if (!Array.isArray(payload)) return [];
    const unique = new Map();
    payload
        .filter(item => item && typeof item === 'object' && item.hitId)
        .forEach(item => unique.set(String(item.hitId), item));
    return [...unique.values()]
        .sort((left, right) => Number(right.sequence || 0) - Number(left.sequence || 0))
        .slice(0, 100);
}

export function latestHit(summaries) {
    return normalizeHitSummaries(summaries)[0] || null;
}

export function visibleStackFrames(frames, expanded, collapsedCount = 8) {
    if (!Array.isArray(frames)) return [];
    return expanded ? frames : frames.slice(0, collapsedCount);
}

export function normalizeCapturedValue(value) {
    if (value == null) return { kind: 'NULL', type: null, value: null };
    if (typeof value !== 'object') {
        return { kind: 'SCALAR', type: typeof value, value };
    }

    const kind = String(value.kind || inferKind(value));
    if (kind === 'OBJECT') {
        return {
            kind,
            type: value.type || null,
            fields: Array.isArray(value.fields)
                ? value.fields.map(normalizeCapturedEntry)
                : [],
            truncated: Boolean(value.truncated),
            error: value.error || null,
        };
    }
    if (kind === 'ARRAY') {
        return {
            kind,
            type: value.type || null,
            length: Number.isFinite(Number(value.length)) ? Number(value.length) : null,
            items: Array.isArray(value.items)
                ? value.items.map((item, index) => normalizeArrayItem(item, index))
                    .filter(item => item.kind !== 'NULL')
                : [],
            truncated: Boolean(value.truncated),
        };
    }
    if (kind === 'NULL') {
        return { kind, type: value.type || null, value: null };
    }
    if (kind === 'REFERENCE') {
        return {
            kind,
            type: value.type || null,
            value: value.value ?? '<reference>',
            cycle: Boolean(value.cycle),
        };
    }
    if (kind === 'TRUNCATED') {
        return {
            kind,
            type: value.type || null,
            value: value.value ?? null,
            truncated: true,
        };
    }
    if (kind === 'SCALAR' || kind === 'CLASS') {
        return { kind, type: value.type || null, value: value.value };
    }

    return {
        kind: 'SCALAR',
        type: value.type || typeof value,
        value: value.value ?? value,
    };
}

export function normalizeCapturedEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return { name: '', declaredType: null, declaringClass: null, value: normalizeCapturedValue(entry), error: null };
    }
    return {
        name: entry.name == null ? '' : String(entry.name),
        declaredType: entry.declaredType || null,
        declaringClass: entry.declaringClass || null,
        value: normalizeCapturedValue(entry.value),
        error: entry.error || null,
    };
}

export function normalizeCapturedValues(values) {
    if (!Array.isArray(values)) return [];
    return values.map(normalizeCapturedEntry);
}

/**
 * Keep matching values and the object/array nodes needed to reach them.
 * Filtering is display-only; input remains untouched.
 */
export function filterCapturedValues(values, query) {
    const normalized = normalizeCapturedValues(values);
    const needle = String(query || '').trim().toLocaleLowerCase();
    if (!needle) return normalized;
    return normalized.filter(entry => {
        const nameMatch = textMatches(entry.name, needle)
            || textMatches(entry.declaredType, needle)
            || textMatches(entry.declaringClass, needle)
            || textMatches(entry.error, needle);
        const filtered = filterCapturedValue(entry.value, needle, nameMatch);
        if (!filtered) return false;
        entry.value = filtered;
        return true;
    });
}

export function filterCapturedValue(value, query, includeWholeValue = false) {
    const node = normalizeCapturedValue(value);
    const needle = String(query || '').trim().toLocaleLowerCase();
    if (!needle || includeWholeValue || nodeMatches(node, needle)) return node;

    if (node.kind === 'OBJECT') {
        const fields = node.fields
            .map(entry => {
                const nameMatch = textMatches(entry.name, needle)
                    || textMatches(entry.declaredType, needle)
                    || textMatches(entry.declaringClass, needle)
                    || textMatches(entry.error, needle);
                const filtered = filterCapturedValue(entry.value, needle, nameMatch);
                if (!filtered) return null;
                return { ...entry, value: filtered };
            })
            .filter(Boolean);
        return fields.length ? { ...node, fields } : null;
    }
    if (node.kind === 'ARRAY') {
        const items = node.items
            .map(item => {
                const filtered = filterCapturedValue(item, needle);
                return filtered ? copyArrayIndex(filtered, item.arrayIndex) : null;
            })
            .filter(Boolean);
        return items.length ? { ...node, items } : null;
    }
    return null;
}

export function capturedTextMatches(value, query) {
    const needle = String(query || '').trim().toLocaleLowerCase();
    return Boolean(needle) && textMatches(value, needle);
}

export function capturedValueDirectMatches(value, query) {
    const node = normalizeCapturedValue(value);
    const needle = String(query || '').trim().toLocaleLowerCase();
    return Boolean(needle) && nodeMatches(node, needle);
}

export function capturedValueMatches(value, query) {
    const node = normalizeCapturedValue(value);
    const needle = String(query || '').trim().toLocaleLowerCase();
    if (!needle) return false;
    if (nodeMatches(node, needle)) return true;
    if (node.kind === 'OBJECT') {
        return node.fields.some(entry => capturedEntryMatches(entry, needle));
    }
    return node.kind === 'ARRAY'
        && node.items.some(item => capturedValueMatches(item, needle));
}

export function capturedEntryMatches(entry, query) {
    const needle = String(query || '').trim().toLocaleLowerCase();
    if (!needle || !entry) return false;
    return textMatches(entry.name, needle)
        || textMatches(entry.declaredType, needle)
        || textMatches(entry.declaringClass, needle)
        || textMatches(entry.error, needle)
        || capturedValueMatches(entry.value, needle);
}

/** Return value tree with children hidden after maxDepth for Object view. */
export function limitCapturedValueDepth(value, maxDepth = 3, depth = 0) {
    const node = normalizeCapturedValue(value);
    if (!isExpandableCapturedValue(node)) {
        return node;
    }
    if (depth >= maxDepth) {
        return node.kind === 'OBJECT'
            ? { ...node, fields: [], depthLimited: true }
            : { ...node, items: [], depthLimited: true };
    }
    if (node.kind === 'OBJECT') {
        return {
            ...node,
            fields: node.fields.map(entry => ({
                ...entry,
                value: limitCapturedValueDepth(entry.value, maxDepth, depth + 1),
            })),
        };
    }
    return {
        ...node,
        items: node.items.map(item => limitCapturedValueDepth(item, maxDepth, depth + 1)),
    };
}

export function isExpandableCapturedValue(value) {
    const kind = normalizeCapturedValue(value).kind;
    return kind === 'OBJECT' || kind === 'ARRAY';
}

export function formatCapturedValue(value) {
    if (value == null) return 'unavailable';
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return 'Value could not be rendered.';
    }
}

export function mergeBreakpoint(items, incoming) {
    if (!incoming?.breakpointId) return items;
    return [incoming, ...items.filter(
        item => item.breakpointId !== incoming.breakpointId,
    )];
}

function inferKind(value) {
    if (Array.isArray(value)) return 'ARRAY';
    if (Object.prototype.hasOwnProperty.call(value, 'fields')) return 'OBJECT';
    if (Object.prototype.hasOwnProperty.call(value, 'items')) return 'ARRAY';
    if (Object.prototype.hasOwnProperty.call(value, 'value')) return 'SCALAR';
    return 'OBJECT';
}

function normalizeArrayItem(value, index) {
    const node = normalizeCapturedValue(value);
    Object.defineProperty(node, 'arrayIndex', {
        configurable: true,
        enumerable: false,
        value: value?.arrayIndex ?? index,
    });
    return node;
}

function copyArrayIndex(node, index) {
    if (index == null) return node;
    Object.defineProperty(node, 'arrayIndex', {
        configurable: true,
        enumerable: false,
        value: index,
    });
    return node;
}

function nodeMatches(node, needle) {
    return textMatches(node.type, needle)
        || textMatches(node.value, needle)
        || textMatches(node.kind, needle)
        || (node.cycle && textMatches('cycle', needle))
        || (node.truncated && textMatches('truncated', needle));
}

function textMatches(value, needle) {
    if (value == null) return false;
    return String(value).toLocaleLowerCase().includes(needle);
}
