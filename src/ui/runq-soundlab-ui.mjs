// Sound design helpers: one-click example prompts and a character counter.
// Only fills the prompt field; it never starts a generation and never touches cues or transport.
const EXAMPLES = [
  ['Puerta de madera', 'Wooden door', 'Una vieja puerta de madera chirría al abrirse y se cierra. Sin música.', 'An old wooden door creaks open and closes. No music.'],
  ['Tormenta lejana', 'Distant storm', 'Una tormenta lejana con truenos graves y lluvia suave. Sin música.', 'A distant thunderstorm with deep rumbles and soft rain. No music.'],
  ['Campana', 'Church bell', 'Una única campana de iglesia que resuena en un espacio amplio. Sin música.', 'A single church bell ringing and echoing in a large space. No music.'],
  ['Aplausos', 'Applause', 'Aplausos de un público de teatro que crecen y se apagan. Sin música.', 'Theatre audience applause that swells and fades. No music.'],
  ['Pasos en escenario', 'Stage footsteps', 'Pasos lentos sobre tablas de madera de un escenario vacío. Sin música.', 'Slow footsteps on the wooden boards of an empty stage. No music.'],
];

function mount() {
  const prompt = document.getElementById('soundPrompt');
  const label = prompt?.closest('label');
  if (!prompt || !label || document.querySelector('.sl-chips')) return;
  const es = () => document.documentElement.lang === 'es' || /es/i.test(localStorage.getItem('runq.ui.locale') || '');

  const count = document.createElement('span');
  count.className = 'sl-count';
  label.querySelector(':scope > span')?.appendChild(count);
  const updateCount = () => { count.textContent = `${prompt.value.length}/${prompt.maxLength > 0 ? prompt.maxLength : 1000}`; };
  prompt.addEventListener('input', updateCount);
  updateCount();

  const chips = document.createElement('div');
  chips.className = 'sl-chips';
  const caption = document.createElement('span');
  caption.className = 'sl-chips-label';
  chips.appendChild(caption);
  const buttons = EXAMPLES.map((ex) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sl-chip';
    b.addEventListener('click', () => {
      prompt.value = es() ? ex[2] : ex[3];
      prompt.dispatchEvent(new Event('input', { bubbles: true }));
      prompt.focus();
    });
    chips.appendChild(b);
    return [b, ex];
  });
  const render = () => {
    caption.textContent = es() ? 'Ideas rápidas:' : 'Quick ideas:';
    for (const [b, ex] of buttons) b.textContent = es() ? ex[0] : ex[1];
  };
  render();
  document.getElementById('uiLocaleSelect')?.addEventListener('change', () => queueMicrotask(render));
  chips.appendChild(count);
  label.after(chips);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
