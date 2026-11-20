const STEP_MS = 110;
const FRAMES = ['◐', '◓', '◑', '◒'];
const cellLen = (s) => [...s].length;
const clipRun = (r, width) => {
    if (r.x >= width)
        return null;
    const chars = [...r.text];
    const start = r.x < 0 ? -r.x : 0;
    const max = width - Math.max(0, r.x);
    const text = chars.slice(start, start + max).join('');
    return text ? { ...r, x: Math.max(0, r.x), text } : null;
};
const Ring = (props, surface) => {
    const { Box, Text } = surface.elements;
    const ref = surface.state?.ref ?? { phase: 0, active: props.active };
    ref.active = props.active;
    if (surface.state === undefined) {
        surface.setState({ ref });
        surface.every(STEP_MS, () => {
            if (ref.active) {
                ref.phase += 1;
                surface.setState({ ref });
            }
        });
    }
    const width = Math.max(1, surface.columns || props.width);
    const height = Math.max(1, props.height || props.rows.length);
    const face = props.mono ? { mono: true } : {};
    const spinnerGlyph = FRAMES[ref.phase % FRAMES.length] ?? '◐';
    const rowGroups = (runs) => {
        const groups = [];
        let cursor = 0;
        for (const raw of runs) {
            const r = clipRun(raw, width);
            if (!r || r.x < cursor)
                continue;
            const gap = r.x - cursor;
            const last = groups[groups.length - 1];
            if (last && gap === 0)
                last.items.push(r);
            else
                groups.push({ gap, items: [r] });
            cursor = r.x + cellLen(r.text);
        }
        return groups;
    };
    const buildRow = (y) => {
        const baseRuns = props.rows[y] ?? [];
        if (!props.active)
            return rowGroups(baseRuns);
        const cells = Array.from({ length: width }, () => null);
        for (const r of baseRuns) {
            const chars = [...r.text];
            for (let i = 0; i < chars.length; i += 1) {
                const x = r.x + i;
                const ch = chars[i];
                if (x >= 0 && x < width && ch !== ' ') {
                    cells[x] = { ch, color: r.color, bold: Boolean(r.bold), dim: Boolean(r.dim) };
                }
            }
        }
        for (const path of props.paths) {
            const L = path.cells.length;
            if (L === 0)
                continue;
            for (const c of path.cells) {
                if (c.y === y && c.x >= 0 && c.x < width) {
                    cells[c.x] = { ch: c.glyph, color: path.baseColor, bold: false, dim: false };
                }
            }
            if (path.closed) {
                const stride = Math.max(8, path.stride || 12);
                for (let base = 0; base < L; base += stride) {
                    const head = (base + ref.phase) % L;
                    const tail = (head - 1 + L) % L;
                    if (L >= 4) {
                        const tc = path.cells[tail];
                        if (tc && tc.y === y && tc.x >= 0 && tc.x < width) {
                            cells[tc.x] = { ch: '•', color: path.color, bold: false, dim: false };
                        }
                    }
                    const hc = path.cells[head];
                    if (hc && hc.y === y && hc.x >= 0 && hc.x < width) {
                        cells[hc.x] = { ch: '●', color: path.color, bold: true, dim: false };
                    }
                }
            }
            else {
                const travel = L > 1 ? L - 1 : 1;
                const period = Math.max(travel + 3, path.stride || 8);
                const head = ref.phase % period;
                if (head < travel) {
                    const hc = path.cells[head];
                    if (hc && hc.y === y && hc.x >= 0 && hc.x < width) {
                        cells[hc.x] = { ch: '●', color: path.color, bold: true, dim: false };
                    }
                }
                if (head - 1 >= 0 && head - 1 < travel) {
                    const tc = path.cells[head - 1];
                    if (tc && tc.y === y && tc.x >= 0 && tc.x < width) {
                        cells[tc.x] = { ch: '•', color: path.color, bold: false, dim: false };
                    }
                }
            }
        }
        for (const sp of props.spinners) {
            if (sp.y === y && sp.x >= 0 && sp.x < width) {
                cells[sp.x] = { ch: spinnerGlyph, color: sp.color, bold: true, dim: false };
            }
        }
        const runs = [];
        for (let x = 0; x < width; x += 1) {
            const c = cells[x];
            if (!c)
                continue;
            const last = runs[runs.length - 1];
            if (last &&
                last.x + cellLen(last.text) === x &&
                last.color === c.color &&
                Boolean(last.bold) === c.bold &&
                Boolean(last.dim) === c.dim) {
                last.text += c.ch;
            }
            else {
                runs.push({ x, text: c.ch, color: c.color, ...(c.bold ? { bold: true } : {}), ...(c.dim ? { dim: true } : {}) });
            }
        }
        return rowGroups(runs);
    };
    const nonEmpty = [];
    for (let y = 0; y < height; y += 1) {
        const groups = buildRow(y);
        if (groups.length > 0)
            nonEmpty.push({ y, groups });
    }
    const children = [];
    for (let i = 0; i < nonEmpty.length; i += 1) {
        const row = nonEmpty[i];
        const prevY = i === 0 ? -1 : nonEmpty[i - 1].y;
        const topGap = row.y - prevY - 1;
        const botGap = i === nonEmpty.length - 1 ? height - 1 - row.y : 0;
        children.push(<Box width={width} overflow="hidden" {...(topGap > 0 ? { marginTop: topGap } : {})} {...(botGap > 0 ? { marginBottom: botGap } : {})}>
        {row.groups.map(g => (<Box flexShrink={0} {...(g.gap > 0 ? { marginLeft: g.gap } : {})}>
            {g.items.map(item => (<Text color={item.color} {...(item.bold ? { bold: true } : {})} {...(item.dim ? { dimColor: true } : {})} {...face}>
                {item.text}
              </Text>))}
          </Box>))}
      </Box>);
    }
    return (<Box width={width} flexDirection="column" overflow="hidden">
      {children}
    </Box>);
};
export default Ring;
