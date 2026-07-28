export function normalizeInspection(inspection) {
    if (!inspection || typeof inspection !== 'object' || Array.isArray(inspection)) {
        return null;
    }
    const capabilities = inspection.capabilities
        && typeof inspection.capabilities === 'object'
        && !Array.isArray(inspection.capabilities)
        ? inspection.capabilities : {};
    return {
        ...inspection,
        executableDisplayLines: Array.isArray(inspection.executableDisplayLines)
            ? inspection.executableDisplayLines : [],
        ambiguousDisplayLines: Array.isArray(inspection.ambiguousDisplayLines)
            ? inspection.ambiguousDisplayLines : [],
        methods: Array.isArray(inspection.methods) ? inspection.methods : [],
        capabilities: {
            ...capabilities,
            lineBreakpoints: capabilities.lineBreakpoints === true,
            limitations: Array.isArray(capabilities.limitations)
                ? capabilities.limitations : [],
        },
    };
}
