/**
 * Factory body of the opencode ui Client module.
 *
 * build.mjs embeds this file verbatim inside `factory(require) { … }`, so the
 * enclosing scope provides `React`, `h`, `TOKENS`, `SETTINGS_CSS` and
 * `APP_CSS`, and this file must declare `apply`.
 *
 * Three responsibilities:
 *  1. Theme layer — `ctx.theme.overrideTokens` stacks a { light, dark } token
 *     layer over the active theme. The presenter writes the composed snapshot
 *     onto `body.style`, so this beats every stylesheet and needs no CSS
 *     specificity games; the returned disposer restores the base theme.
 *  2. Structure layer — one `<style>` tag with the settings-page and main-UI
 *     rules, removed with the owning effect.
 *  3. The git-branch entry in the composer dock, kept from the original
 *     @local/git-branch plugin and restyled to the opencode language.
 */

const PLUGIN_ID = '@local/opencode-ui';
const POLL_MS = 3000;

/** 24-viewBox branch glyph matching the outline icon family. */
function BranchIcon() {
  return h('svg', {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  },
    h('line', { x1: 6, y1: 3, x2: 6, y2: 15 }),
    h('circle', { cx: 18, cy: 6, r: 3 }),
    h('circle', { cx: 6, cy: 18, r: 3 }),
    h('path', { d: 'M18 9a9 9 0 0 1-9 9' }),
  );
}

/** `ref: refs/heads/main` → `main`; a raw sha (detached) → `HEAD@abc1234`. */
function parseHead(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  const m = /^ref:\s*refs\/(?:heads|remotes)\/(.+)$/m.exec(t);
  if (m) return m[1].trim();
  if (/^[0-9a-f]{7,40}$/i.test(t)) return 'HEAD@' + t.slice(0, 7);
  return null;
}

/** Resolve the HEAD text, following a worktree/submodule `.git` gitdir pointer. */
async function readHead(remote, sessionId, cwd, signal) {
  const join = (base, rel) => (base.endsWith('/') ? base + rel : base + '/' + rel);
  const tryRead = async (path) => {
    try {
      const result = await remote.workspaceFiles.read(sessionId, path, {}, signal);
      return result && result.ok ? String(result.value?.text ?? '') : null;
    } catch {
      return null;
    }
  };
  const head = await tryRead('.git/HEAD');
  if (head !== null) return head;
  const pointer = await tryRead('.git');
  if (pointer === null) return null;
  const m = /^gitdir:\s*(.+)$/m.exec(pointer);
  if (!m) return null;
  const dir = m[1].trim();
  const abs = dir.startsWith('~') ? dir.slice(1) : dir;
  const base = /^[~\\/]/.test(abs) ? abs : join(cwd ?? '', dir);
  return tryRead(join(base, 'HEAD'));
}

function BranchPill({ sessionId, useSessions, remoteRef }) {
  const cwd = useSessions((s) => (sessionId === undefined ? undefined : s.byId[sessionId]?.cwd));
  const [head, setHead] = React.useState(null);
  React.useEffect(() => {
    if (sessionId === undefined) return undefined;
    let alive = true;
    let timer = null;
    const tick = async () => {
      const remote = remoteRef.current;
      if (remote && cwd) {
        const next = await readHead(remote, sessionId, cwd, undefined).catch(() => null);
        if (alive) setHead(next);
      }
      if (alive) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      alive = false;
      if (timer !== null) clearTimeout(timer);
    };
  }, [sessionId, cwd, remoteRef]);
  const branch = parseHead(head);
  if (!branch) return null;
  return h('span', { className: 'ocui-anchor', 'data-composer-stat': 'git-branch' },
    h('span', { className: 'ocui-pill', title: cwd ? `${branch} — ${cwd}` : branch },
      h(BranchIcon, null),
      h('span', { className: 'ocui-label' }, branch),
    ),
  );
}

/**
 * The plugin's own component styles plus the two carry-over rules from
 * @local/git-branch that hide the sidebar brand row and its "new session"
 * button. Those two were an explicit choice of the original plugin and are
 * preserved so the rename does not silently change what the user sees.
 * The suffix selectors are stable across builds; a miss degrades to "nothing
 * hidden" and never breaks rendering.
 */
const OWN_CSS = [
  // Follows the user's font preference the way the shipped StatsPills do: one
  // step below the secondary size, offset by the same delta. Hard-coding 12px
  // here would freeze the dock while everything around it rescales.
  '.ocui-anchor{min-width:0;display:inline-flex;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));letter-spacing:-.04px}',
  '.ocui-pill{box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;padding:1px 8px;border:0;border-radius:var(--dsw-radius-sm);background:0 0;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;white-space:nowrap;max-width:100%}',
  '.ocui-pill svg{flex:none;width:14px;height:14px}',
  '.ocui-label{min-width:0;max-width:220px;overflow:hidden;text-overflow:ellipsis}',
  // Carry-over from @local/git-branch. `html body` scoping keeps these inside
  // the same ancestor-qualified convention as the rest of the skin; `!important`
  // stays because hiding is the whole point and the sidebar rules these beat
  // are compound selectors that can gain specificity between releases.
  'html body :is([class$="_logoRow"], [class*="_logoRow "]){display:none!important}',
  'html body button:is([class$="_newSession"], [class*="_newSession "]){display:none!important}',
].join('\n');

const STYLES = [SETTINGS_CSS, APP_CSS, OWN_CSS].filter(Boolean).join('\n');

/**
 * Mount the skin.
 * @param ctx - the browser plugin context.
 */
function apply(ctx) {
  ctx.inject(['theme'], (scope) => {
    scope.effect(
      () => scope.theme.overrideTokens(PLUGIN_ID, TOKENS),
      'opencode-ui: theme token layer',
    );
  });

  ctx.effect(() => {
    const tag = document.createElement('style');
    tag.dataset.plugin = PLUGIN_ID;
    tag.textContent = STYLES;
    document.head.appendChild(tag);
    return () => tag.remove();
  }, 'opencode-ui: skin stylesheet');

  const remoteRef = { current: null };
  ctx.inject(['remote', 'remote.workspaceFiles'], (scope) => {
    remoteRef.current = scope.remote;
  });

  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register(
    { name: 'conversation.composer.dock', id: 'opencode-ui', order: 2 },
    (props) => h(BranchPill, { ...props, remoteRef }),
  ));
}
