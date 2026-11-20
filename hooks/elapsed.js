const fmt = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    return m < 60 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
};
const fmtSpan = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    if (m === 0)
        return `${s}s`;
    if (m >= 60)
        return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
    return s % 60 === 0 ? `${m}m` : `${m}m${String(s % 60).padStart(2, '0')}s`;
};
const Elapsed = (props, surface) => {
    const { Text } = surface.elements;
    const ref = surface.state?.ref ?? { base: 0, ticks: 0, lastNow: -1, isRunning: true };
    if (props.now !== ref.lastNow) {
        // A fresh reading from the hooks module: restart the local count from it.
        ref.lastNow = props.now;
        ref.base = (props.endAt ?? props.now) - props.since;
        ref.ticks = 0;
    }
    ref.isRunning = props.endAt === null;
    if (surface.state === undefined) {
        surface.setState({ ref });
        surface.every(1000, () => {
            if (ref.isRunning) {
                ref.ticks += 1;
                surface.setState({ ref });
            }
        });
    }
    return <Text color={props.color}>{(props.span ? fmtSpan : fmt)(ref.base + ref.ticks * 1000)}</Text>;
};
export default Elapsed;
