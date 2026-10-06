import React, { useState, useEffect, useRef, useMemo } from 'react';
import { BookOpen, Volume2, VolumeX, AlertTriangle, CheckCircle, XCircle, X, History, Copy, Check, Trash2, Play, Info, BarChart2, ChevronDown, UserCircle, Blocks, Table2, PenLine, Sun, Moon } from 'lucide-react';
/* El chip de los dos ejes (forma + − ? y tipo abierta/cerrada) va generado
   desde design-tokens: tiene que ser el MISMO objeto en las cuatro apps. */
import { FormChip, FormSign } from './forms.generated.jsx';
import {
  translations,
  commonVerbs,
  irregularVerbs,
  COURSE_ORDER,
  modes,
  tenses,
  modals,
  whWords,
  whSuggestions,
  whAsks,
  whExtPideSustantivo,
  whSubjectWords,
  CONDICIONALES_POR_CURSO,
  UNIDADES_POR_CURSO,
  unidadIndice,
  estaVisto,
  unidadPorRevisar,
  PARES_CONDICIONAL,
  COMPLEMENTOS_BE,
  COMPLEMENTOS_ADVERBIALES,
  COMPLEMENTOS_TIEMPO,
  COMPLEMENTO_DE_VERBO,
  VERBOS_FUERA_DE_PRACTICA,
  VERBOS_REGULARES,
  VERBOS_REGULARES_AMPLIA,
  VERBOS_IRREGULARES,
  VERBOS_IRREGULARES_BASICO,
  VERBOS_IRREGULARES_INTERMEDIO,
  VERBOS_IRREGULARES_AVANZADO,
  frequencyAdverbs,
  timeMarkers,
  detectarMarcador,
  marcadorCuadra,
  uncountableNouns,
  countableNouns,
  validateSubject,
  validateVerb,
  revisarVerboAntesDeGenerar,
  validateComplement,
} from './data';
import { getSpellingSuggestions } from './spelling';
/* Mayúsculas: meses, días y nacionalidades. Motor y lista generados desde
   Grammar HUB — ver capitals-engine.js para por qué es una regla aparte. */
import { revisarMayusculas, CAPS_CANONICO, CAPS_AMBIGUAS } from './data/capitals.generated.js';
import {
  smartCaseSubject,
  isThirdPersonSingular,
  expandirNegacion,
  registrarNombres,
  nombreAmbiguo,
  getBeForm,
  getWasWere,
  getHasHave,
  presentParticiple,
  simplePast,
  pastParticiple,
  conjugate3p,
  getAuxAndVerbForm,
  buildVerbPhrase,
  buildSentenceText,
  buildConditionalText,
  CONDICIONALES,
  conditionalVerbPhrase,
  esWasPorWere,
  detectConjugatedVerbBase,
  getVerbChangeType,
} from './conjugation';
import { useClipboard, useSpeechSynthesis, useLocalStorage, useSessionStats } from './hooks';
import { ROLE_TW, ROLE_FILL } from './tokens.generated.js';
import { tablaDeTiempos, MODOS } from './tablaTiempos';
import { formasDe, FILAS_DE_FORMAS, revisarVerbo } from './conjugador';
import { TENSE_FAMILIES, ASPECTS } from './tenseFamilies.generated.js';
import { loadProgress, saveProgress, recordAttempt, recordRound, evaluateBadges, BADGES, todayISO } from './gamification.generated.js';

/* Toggle de tema de la suite (auto→claro→oscuro por SO; toggle binario que ofrece
   el modo destino). Usa window.ghTheme, sincronizado same-origin entre las 4 apps. */
/* Lo inyecta vite.config.js al construir. En `npm run dev` no existe, y ahí da
   igual: el reporte solo importa cuando la app está publicada. */
const APP_VERSION = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev';

function ThemeToggle({ lang = 'es' }) {
  const [eff, setEff] = useState(() => (typeof window !== 'undefined' && window.ghTheme ? window.ghTheme.effective() : 'light'));
  useEffect(() => {
    if (!window.ghTheme) return;
    const sync = () => setEff(window.ghTheme.effective());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener ? mq.addEventListener('change', sync) : mq.addListener(sync);
    const onStorage = (e) => { if (e.key === 'gh_theme') sync(); };
    window.addEventListener('storage', onStorage);
    return () => {
      mq.removeEventListener ? mq.removeEventListener('change', sync) : mq.removeListener(sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  /* Embebida en el Hub: el tema se maneja desde la barra del Hub, no desde
     aqui — en celular esta cabecera queda cargada y el boton compite con el
     titulo. Standalone / PWA es el unico que hay, asi que se mantiene.
     El corte va DESPUES de los hooks: si no, serian hooks condicionales. */
  if (typeof window !== 'undefined' && window.self !== window.top) return null;
  const target = eff === 'dark' ? 'light' : 'dark';
  const name = { es: { light: 'Claro', dark: 'Oscuro' }, en: { light: 'Light', dark: 'Dark' } }[lang][target];
  return (
    <button
      onClick={() => window.ghTheme && setEff(window.ghTheme.toggle())}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-bold bg-slate-100 border border-slate-300 text-slate-600 hover:bg-slate-50 transition-all"
      title={`${lang === 'es' ? 'Cambiar a modo' : 'Switch to'} ${name.toLowerCase()}`}
      aria-label={`${lang === 'es' ? 'Cambiar a modo' : 'Switch to'} ${name.toLowerCase()}`}
    >
      {/* Icono de línea y no emoji, como toda la barra de abajo y como el mismo
          botón en las otras dos apps y en el hub: el emoji lo dibuja el sistema
          y no se tiñe con el botón. */}
      {target === 'dark'
        ? <Moon className="w-4 h-4 shrink-0" strokeWidth={2} aria-hidden="true" />
        : <Sun className="w-4 h-4 shrink-0" strokeWidth={2} aria-hidden="true" />}
      {/* El rótulo se va en pantalla de teléfono, como ya hace el de Reportar.
          Era el control más ancho de la cabecera y empujaba a «Reportar» fuera
          de la pantalla: acababa en x=501 sobre un viewport de 375. El `title` y
          el `aria-label` siguen diciendo la acción entera. */}
      <span className="hidden sm:inline">{name}</span>
    </button>
  );
}

/* Familia de tiempo (tono = timeType, aspecto del id) para el acento del selector.
   Lee el tema actual en cada llamada para elegir la variante light/dark. */
const aspectOf = (id = '') => (/continuous/.test(id) && /perfect/.test(id)) ? 3 : /perfect/.test(id) ? 2 : /continuous/.test(id) ? 1 : 0;
const themeVariant = () => document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

/* Tinta legible sobre un fondo dado. Se usa en la pastilla del aspecto, único
   sitio donde queda texto sobre la rampa: sus pasos van de un tinte pálido al
   tono puro, así que la tinta no puede ser fija.
   Elige la que MAXIMIZA el contraste en vez de partir por un umbral: con tonos
   de luminancia media (emerald-600, violet-300) el umbral se equivoca y deja
   ratios de 2.7:1. */
const relLum = (hex) => {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const readableInk = (hex) => {
  const L = relLum(hex);
  const vsWhite = 1.05 / (L + 0.05);
  const vsDark = (L + 0.05) / (relLum('#0f172a') + 0.05);
  return vsDark >= vsWhite ? '#0f172a' : '#ffffff';
};
const tenseFam = (tenseId) => {
  const tObj = tenses.find(t => t.id === tenseId);
  const fam = tObj && TENSE_FAMILIES[tObj.timeType];
  if (!fam) return null;
  const v = themeVariant();
  const asp = aspectOf(tObj.id);
  return { color: fam.color[v], ink: fam.ink[v], bg: fam.bg[v][asp], icon: ASPECTS[asp].icon, label: fam.label };
};

/**
 * Selector de tiempos Y modales. Reemplaza al <select> nativo, cuyas opciones no
 * se pueden colorear: aquí cada tiempo muestra su familia (tono = presente/
 * pasado/futuro) con la intensidad y el icono de su aspecto (● ◐ ◆ ◈).
 *
 * Los modales viven aquí como cuarto grupo y no en un control aparte, porque
 * ocupan la MISMA ranura gramatical: lo que determina la forma del verbo. La app
 * ya los trataba como excluyentes (elegir modal desactivaba el selector de
 * tiempos, con un "no aplica con modal" de disculpa); ahora esa exclusión se ve
 * en vez de explicarse. Van en su propio grupo, con el color de la familia
 * `modal` del sistema de diseño, porque un modal NO es un tiempo.
 */
/* Un selector para UNA decisión: qué estructura verbal lleva la oración. Tiempos,
   modales y condicionales compiten por ella, así que van los tres aquí dentro.
   La condicional estaba fuera, en un interruptor que vivía DESPUÉS del selector
   al que reemplazaba — y `tokens.json` ya la tenía definida como familia, con su
   color y su ícono ⇒, para ir junto a las demás. */
function TensePicker({ value, modalValue, condValue, onSelectTense, onSelectModal, onSelectCond,
                       condLabels, condLabel, condHelp, language, cefrLevel, highlight }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const v = themeVariant();
  const sel = tenses.find(t => t.id === value);
  const fam = tenseFam(value);
  const selModal = modals.find(m => m.id && m.id === modalValue);
  const modalFam = TENSE_FAMILIES.modal;
  const condFam = TENSE_FAMILIES.conditional;
  /* La condicional se enseña desde Intermedio II (1ª y 2ª) y la 3ª en AEF 3, así
     que el grupo aparece desde el mismo curso que el resto del contenido de ese
     nivel. Cada opción muestra LOS DOS tiempos y no solo el modal del resultado:
     esa correspondencia ES la regla, y ocultarla fue el error pedagógico que
     hubo que corregir la vez pasada. */
  const condItems = COURSE_ORDER.indexOf('intermedio2') <= COURSE_ORDER.indexOf(cefrLevel)
    ? [1, 2, 3].map(n => ({
        n,
        name: condLabels[n],
        desc: `if · ${(() => { const tn = tenses.find(x => x.id === CONDICIONALES[n].ifTense);
                              return language === 'es' ? tn?.nameEs : tn?.nameEn; })()}`
              + ` → ${n === 1 ? 'will' : n === 2 ? 'would' : 'would have'}`,
      }))
    : [];
  const groups = ['present', 'past', 'future'].map(tt => ({
    tt,
    label: tt === 'present' ? (language === 'es' ? 'Presente' : 'Present') : tt === 'past' ? (language === 'es' ? 'Pasado' : 'Past') : (language === 'es' ? 'Futuro' : 'Future'),
    fam: TENSE_FAMILIES[tt],
    items: tenses.filter(t => t.timeType === tt && COURSE_ORDER.indexOf(t.cefr) <= COURSE_ORDER.indexOf(cefrLevel)),
  })).filter(g => g.items.length > 0);
  const modalItems = modals.filter(m => m.id && COURSE_ORDER.indexOf(m.cefr) <= COURSE_ORDER.indexOf(cefrLevel));

  return (
    <div ref={boxRef} className="relative w-full sm:w-auto sm:flex-1 min-w-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        style={(fam || selModal || condValue) ? { borderLeftWidth: '4px',
          borderLeftColor: condValue ? condFam.color[v] : selModal ? modalFam.color[v] : fam.color } : undefined}
        className={`w-full flex items-center gap-2 px-2.5 py-2 sm:py-1.5 rounded-lg text-sm font-semibold text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer text-left ${
          highlight ? 'border-2 border-indigo-400 ring-2 ring-indigo-200' : 'border border-gray-200'
        }`}
      >
        {condValue ? (
          <>
            <span className="text-base leading-none shrink-0" style={{ color: condFam.color[v] }} aria-hidden="true">{condFam.icon}</span>
            <span className="truncate">{condLabels[condValue]}</span>
          </>
        ) : selModal ? (
          <>
            <span className="text-base leading-none shrink-0" style={{ color: modalFam.color[v] }} aria-hidden="true">{modalFam.icon}</span>
            <span className="truncate">{selModal.name}</span>
            <span className="text-xs font-normal text-muted truncate hidden sm:inline">
              {language === 'es' ? selModal.descEs : selModal.descEn}
            </span>
          </>
        ) : sel && fam ? (
          <>
            <span className="text-base leading-none shrink-0" style={{ color: fam.color }} aria-hidden="true">{fam.icon}</span>
            <span className="truncate">{language === 'es' ? sel.nameEs : sel.nameEn}</span>
          </>
        ) : (
          <span className="text-muted font-medium truncate">{language === 'es' ? 'Selecciona un tiempo, modal o condicional...' : 'Select a tense, modal or conditional...'}</span>
        )}
        <ChevronDown className={`w-4 h-4 ml-auto shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* En escritorio el panel NO hereda el ancho del disparador: ahí comparte
          fila con la etiqueta y los botones de modo, y con dos columnas los
          nombres largos ("Presente Perfecto Continuo") no cabían. */}
      {open && (
        <div role="listbox" className="absolute z-20 mt-1 left-0 w-full sm:w-[34rem] max-w-[calc(100vw-2rem)] max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg p-2">
          {groups.map(g => (
            <div key={g.tt} className="mb-2 last:mb-0">
              <p className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-1 flex items-center gap-1.5" style={{ color: g.fam.color[v] }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: g.fam.color[v] }} aria-hidden="true" />
                {g.label}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {g.items.map(tn => {
                  const asp = aspectOf(tn.id);
                  const selected = tn.id === value;
                  const step = g.fam.bg[v][asp];
                  return (
                    <button
                      key={tn.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => { onSelectTense(tn.id); setOpen(false); }}
                      /* Sin title: el nombre del tiempo ya está a la vista y la
                         familia/aspecto los dice ese mismo nombre. El title solo
                         servía cuando el texto se truncaba, y ya no se trunca. */
                      /* Fondo SIEMPRE el paso más pálido: da el tono (=tiempo)
                         sin comprometer la lectura. La intensidad (=aspecto) se
                         mudó a la pastilla del icono, donde la tinta se calcula. */
                      style={{ background: g.fam.bg[v][0], boxShadow: selected ? `inset 0 0 0 2px ${g.fam.color[v]}` : undefined }}
                      className="flex items-center gap-2 pr-2.5 py-2 rounded-lg text-left text-sm font-medium transition-transform hover:scale-[1.01] overflow-hidden"
                    >
                      {/* Riel: el tono a plena saturación, siempre visible */}
                      <span className="self-stretch w-1 rounded-full shrink-0" style={{ background: g.fam.color[v] }} aria-hidden="true" />
                      {/* Pastilla de aspecto: aquí sí vive la rampa de intensidad */}
                      <span
                        className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-[11px] font-bold"
                        style={{ background: step, color: readableInk(step) }}
                        aria-hidden="true"
                      >
                        {ASPECTS[asp].icon}
                      </span>
                      {/* Sin truncate: si el ancho aprieta, el nombre envuelve
                          en vez de cortarse. El riel es self-stretch, así que
                          acompaña la altura de las filas de dos líneas. */}
                      <span className="min-w-0 leading-tight text-gray-800">{language === 'es' ? tn.nameEs : tn.nameEn}</span>
                      {selected && <Check className="w-3.5 h-3.5 ml-auto shrink-0 text-gray-800" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Condicionales. Ni tiempo ni modal: son dos cláusulas y el TIPO fija
              los dos tiempos. Van aquí porque compiten por la misma decisión, y
              cada opción enseña la correspondencia completa («if · Presente
              Simple → will») en vez de solo el modal del resultado. */}
          {condItems.length > 0 && (
            <div className="pt-2 mt-2 border-t border-gray-200">
              <p className="text-[10px] font-bold uppercase tracking-wide px-1.5 pt-1 flex items-center gap-1.5" style={{ color: condFam.color[v] }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: condFam.color[v] }} aria-hidden="true" />
                {condLabel}
              </p>
              {/* Esta línea vivía en el `title` del interruptor que se eliminó.
                  Aquí queda mejor: es justo donde nace la duda —«¿por qué esta
                  opción no me deja elegir el tiempo?»— y en un tooltip no la
                  veía nadie en móvil. */}
              <p className="text-[11px] text-muted px-1.5 pb-1 leading-tight">{condHelp}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {condItems.map(c => {
                  const selected = c.n === condValue;
                  return (
                    <button
                      key={c.n}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => { onSelectCond(c.n); setOpen(false); }}
                      style={{ background: condFam.bg[v][0], boxShadow: selected ? `inset 0 0 0 2px ${condFam.color[v]}` : undefined }}
                      className="flex items-center gap-2 pr-2.5 py-2 rounded-lg text-left text-sm font-medium transition-transform hover:scale-[1.01] overflow-hidden"
                    >
                      <span className="self-stretch w-1 rounded-full shrink-0" style={{ background: condFam.color[v] }} aria-hidden="true" />
                      <span className="min-w-0 leading-tight">
                        <span className="text-gray-800 font-semibold">{c.name}</span>
                        {/* Sin `nowrap`: el botón lleva `overflow-hidden`, así que
                            «if · Pasado Perfecto → would have» se cortaría en vez
                            de envolver. La correspondencia es lo que se enseña —
                            no puede quedar a medias. */}
                        <span className="block text-[11px] text-gray-600 leading-tight">{c.desc}</span>
                      </span>
                      {selected && <Check className="w-3.5 h-3.5 ml-auto shrink-0 text-gray-800" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Modales. Separado y con su propio color porque un modal NO es un
              tiempo — pero va en el mismo selector porque compite por la misma
              decisión. Sin pastilla de aspecto: no tienen aspecto. */}
          {modalItems.length > 0 && (
            <div className="pt-2 mt-2 border-t border-gray-200">
              <p className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-1 flex items-center gap-1.5" style={{ color: modalFam.color[v] }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: modalFam.color[v] }} aria-hidden="true" />
                {modalFam.label}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {modalItems.map(m => {
                  const selected = m.id === modalValue;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => { onSelectModal(m.id); setOpen(false); }}
                      style={{ background: modalFam.bg[v][0], boxShadow: selected ? `inset 0 0 0 2px ${modalFam.color[v]}` : undefined }}
                      className="flex items-center gap-2 pr-2.5 py-2 rounded-lg text-left text-sm font-medium transition-transform hover:scale-[1.01] overflow-hidden"
                    >
                      <span className="self-stretch w-1 rounded-full shrink-0" style={{ background: modalFam.color[v] }} aria-hidden="true" />
                      <span className="min-w-0 leading-tight">
                        <span className="text-gray-800 font-semibold">{m.name}</span>
                        <span className="block text-[11px] text-gray-600 leading-tight">
                          {language === 'es' ? m.descEs : m.descEn}
                        </span>
                      </span>
                      {selected && <Check className="w-3.5 h-3.5 ml-auto shrink-0 text-gray-800" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── En qué FORMA va el verbo ────────────────────────────────────────────────
   La explicación larga ya existe (`SENTENCE_PART_EXPLANATIONS.verbChanges`) y se
   usa en el desglose de la oración, pero dentro de una celda no cabe: aquí va la
   etiqueta corta y la larga queda en el `title`.

   ANTES DECÍA EL SUFIJO Y ERA REDUNDANTE (lo vio el profesor en la tabla):
   junto a un chip que ya pone «works» sobraba un «+ -s», y junto a «working»
   sobraba un «+ -ing». El sufijo está a la vista; lo que no está a la vista es
   CÓMO SE LLAMA esa forma, que es lo que hay que poder nombrar en clase y lo que
   se busca en la tabla de irregulares.

   SON LOS NOMBRES DEL CONJUGADOR, los mismos cinco, y eso es deliberado: la
   tarjeta de arriba dice «pasado participio» y la celda de abajo tiene que decir
   lo mismo, o el alumno cree que son dos cosas.

   `irregular` NO es una forma sino un aviso, y el motor lo devuelve en lugar de
   la forma: se traduce mirando el tiempo, porque en el Pasado Simple es el
   pasado y en los perfectos es el participio.

   La 3.ª persona no lleva etiqueta A PROPÓSITO. No es ninguna de las cinco
   formas —es el presente con su -s— y ponerle el sufijo era justo la redundancia
   que había que quitar. Que la casilla quede vacía dice algo por sí solo: el
   verbo está en su forma corriente. */
/* Los nombres de las formas, en frase. Son los MISMOS cinco de la tarjeta y de
   la celda: si aquí se dijera «el participio» y allí «pasado participio», el
   alumno tendría que adivinar que hablan de lo mismo. */
const NOMBRE_DE_FORMA = {
  gerundio:   { es: 'el gerundio',          en: 'the -ing form' },
  pasado:     { es: 'el pasado simple',     en: 'the simple past' },
  participio: { es: 'el pasado participio', en: 'the past participle' },
  tercera:    { es: 'la tercera persona',   en: 'the third person' },
};

const CAMBIO_CORTO = {
  base:       { es: 'base',              en: 'base' },
  ing:        { es: 'gerundio',          en: '-ing form' },
  past:       { es: 'pasado simple',     en: 'simple past' },
  participle: { es: 'pasado participio', en: 'past participle' },
};
const FORMA_DE_CELDA = (cambio, tenseId) => {
  if (cambio === 'irregular') {
    return tenseId === 'simple-past' ? CAMBIO_CORTO.past : CAMBIO_CORTO.participle;
  }
  return CAMBIO_CORTO[cambio] || null;
};

/**
 * LA TABLA DE TIEMPOS.
 *
 * El resumen que el profesor arma a mano al cerrar un curso: cada tiempo con su
 * uso, su auxiliar y qué le pasa al verbo en las tres formas. Las filas las
 * construye `tablaDeTiempos` con el MISMO motor que genera las oraciones, así
 * que no puede desviarse de lo que la app enseña al practicar.
 *
 * Lo que el papel no puede hacer, y por eso vale la pena que sea interactiva:
 * cambiar el sujeto y el verbo y ver la tabla entera reescribirse. Ahí está la
 * mitad de la dificultad (does/do, has/have, is/are) y con un verbo irregular la
 * columna del cambio deja de ser decorativa.
 */
function TablaTiempos({ language, cefrLevel }) {
  const es = language === 'es';
  const [sujeto, setSujeto] = useState('she');
  const [verbo, setVerbo] = useState('work');
  const [soloCurso, setSoloCurso] = useState(true);

  /* ¿ES ESTO UN VERBO? La respuesta sale de `revisarVerbo`, que por dentro usa
     el MISMO criterio que avisa en el constructor: dos criterios distintos para
     la misma pregunta acabarían contradiciéndose delante del curso. */
  const revision = useMemo(() => revisarVerbo(verbo), [verbo]);

  /* SI LO ESCRITO YA VENÍA CONJUGADO, SE TRABAJA CON LA BASE — la tarjeta y la
     tabla, las dos. Con «went» en la casilla, conjugar lo escrito daba «wented»
     y «She wented», o sea treinta celdas enseñando justo lo que el alumno estaba
     intentando no escribir. */
  const verboEfectivo = revision.tipo === 'conjugado' ? revision.base : verbo;

  const filas = useMemo(
    () => tablaDeTiempos({ sujeto, verbo: verboEfectivo, nivel: soloCurso ? cefrLevel : null }),
    [sujeto, verboEfectivo, soloCurso, cefrLevel]);

  /* EL CONJUGADOR. Delante de un verbo nuevo, lo primero que se pregunta un
     alumno no es en qué tiempo va: es «¿cómo era el pasado de este?». Las formas
     principales van ARRIBA por eso, y la tabla de abajo contesta la otra mitad
     —qué le pasa a cada forma en los diez tiempos— sin cambiar de pantalla.
     El mismo `verbo` alimenta las dos, así que no pueden decir cosas distintas.
     `|| 'work'` es el mismo respaldo que usa `tablaDeTiempos`: con la casilla
     vacía las dos siguen mostrando lo mismo, y no una la muestra y otra no. */
  const formas = useMemo(() => formasDe(verboEfectivo) || formasDe('work'), [verboEfectivo]);

  /* El PATRÓN dicho con palabras, que es lo que se memoriza. «Irregular» a secas
     mete en el mismo saco a `cut`, que no cambia nunca, y a `go`, que cambia dos
     veces. Y como es texto y no un color, se lee igual proyectado y en gris. */
  const PATRON = {
    regular: { es: 'regular · la regla del -ed', en: 'regular · the -ed rule' },
    'tres-iguales': { es: 'irregular · las tres formas iguales', en: 'irregular · all three the same' },
    'dos-iguales': { es: 'irregular · pasado y participio iguales', en: 'irregular · past and participle the same' },
    'tres-distintas': { es: 'irregular · las tres distintas', en: 'irregular · all three different' },
  };

  /* En un verbo de dos palabras la que cambia es la CABEZA. Se separa para poder
     apagar la partícula: así se ve de un vistazo que «up» está igual en las seis
     y que todo el trabajo lo hace «get». */
  const partirForma = (texto) => {
    if (!formas.particula) return [texto, ''];
    const cola = ' ' + formas.particula;
    return texto.endsWith(cola) ? [texto.slice(0, -cola.length), cola] : [texto, ''];
  };

  /* LOS SIETE, no una muestra. Estaban «I», «she» y «they» como representantes
     de los tres comportamientos (am / -s / base), y el razonamiento era bueno
     para un ejemplo y malo para una tabla de consulta: el alumno que duda no
     duda de la clase de sujeto, duda de SU sujeto. Con «you» y «we» fuera, la
     pregunta más repetida de la clase —«¿y con you cuál va?»— no tenía respuesta
     aquí, y la que sí estaba («they») exigía saber de antemano que you se
     comporta igual, que es justo lo que no se sabe todavía.
     En el orden del paradigma, que es como se recitan y como vienen en cualquier
     libro; no agrupados por auxiliar. */
  const SUJETOS = ['I', 'you', 'he', 'she', 'it', 'we', 'they'];
  const COLUMNAS = [
    ['affirmative', '+', es ? 'Afirmativa' : 'Affirmative'],
    ['negative', '−', es ? 'Negativa' : 'Negative'],
    ['interrogative', '?', es ? 'Interrogativa' : 'Interrogative'],
  ];

  return (
    <div>
      <p className="text-gray-600 mb-2">
        {es ? 'Escribe un verbo: arriba salen sus cinco formas —base, infinitivo, gerundio, pasado simple y pasado participio— y abajo en cuál de ellas va en cada uno de los diez tiempos. Cambia también el sujeto y la tabla se rearma con el mismo motor que genera las oraciones. Debajo de cada frase van sus dos piezas — el auxiliar en cápsula clara y el verbo en rojo pleno. Fíjate en que la marca no desaparece, se muda al auxiliar.'
            : 'Type a verb: its five forms appear above — base, infinitive, -ing, simple past and past participle — and below, which one it takes in each of the ten tenses. Change the subject too and the table is rebuilt with the same engine that generates the sentences. Under each sentence are its two pieces — the auxiliary in a pale pill, the verb in solid red. Notice the mark does not vanish — it moves to the auxiliary.'}
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-slate-600">{es ? 'Sujeto' : 'Subject'}</span>
          {/* `flex-wrap`: con siete la fila puede no caber en 360px, y lo que
              no puede pasar es que la cápsula empuje la página a lo ancho. */}
          <div className="flex flex-wrap bg-slate-100 border border-slate-200 rounded-lg p-0.5">
            {SUJETOS.map(s => (
              <button key={s} onClick={() => setSujeto(s)} aria-pressed={sujeto === s}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${
                  sujeto === s ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600 hover:text-slate-800'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-slate-600">{es ? 'Verbo' : 'Verb'}</span>
          <input
            type="text" value={verbo} onChange={(e) => setVerbo(e.target.value)}
            autoCapitalize="none" autoCorrect="off" spellCheck="false" placeholder="work"
            className="w-24 px-2 py-1 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none" />
        </label>

        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
          <input type="checkbox" checked={soloCurso} onChange={(e) => setSoloCurso(e.target.checked)} />
          {es ? `solo lo visto hasta ${cursoLabel(cefrLevel, language)}` : `only what ${cursoLabel(cefrLevel, language)} has covered`}
        </label>
      </div>

      {/* LAS FORMAS DEL VERBO. Ni una escrita a mano: las cinco salen de
          `conjugador.js`, que llama al mismo motor que construye las oraciones
          de abajo. Si mañana se corrige una regla de escritura, se corrigen las
          dos cosas a la vez y no puede quedar una diciendo «studys».
          Sin explicación debajo de cada forma —se probó y el profesor la quitó—:
          esto es material de consulta, se mira para resolver una duda concreta.
          Lo que explica cada forma es la tabla de abajo, viéndola funcionar. */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-2">
          <h3 className="text-sm font-bold text-slate-900">
            {es ? 'Las formas de' : 'The forms of'}{' '}
            <span style={{ color: 'var(--rol-verb)' }}>{formas.base}</span>
          </h3>
          {/* EL PATRÓN SOLO SE AFIRMA DE UN VERBO QUE CONOCEMOS. Con «wrok» la
              insignia decía «regular · la regla del -ed», que es exactamente la
              falsa certeza que había que quitar: de una palabra que no está en
              ninguna lista no sabemos si es regular — solo sabemos que la regla
              regular es lo único que podemos aplicarle. Callar aquí es la mitad
              del aviso de abajo. */}
          {(revision.tipo === null || revision.tipo === 'conjugado') && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white border border-slate-300 text-slate-700">
              {es ? PATRON[formas.patron].es : PATRON[formas.patron].en}
            </span>
          )}
        </div>

        {/* LO QUE SE ESCRIBIÓ YA ESTABA CONJUGADO. No se pregunta nada: aquí no
            hay duda que confirmar, «went» es el pasado de «go» y punto. Se
            conjuga la base y se dice de dónde salió, que es lo que hace un
            diccionario cuando buscas una forma conjugada. La alternativa era
            conjugar lo escrito y enseñar «wented». */}
        {revision.tipo === 'conjugado' && (
          <p className="mb-2 text-[11px] text-slate-600">
            {es ? <>Escribiste <b>{verbo.trim().toLowerCase()}</b>, que es {(NOMBRE_DE_FORMA[revision.forma] || {}).es || 'una forma'} de <b>{revision.base}</b>. Estas son las formas de <b>{revision.base}</b>.</>
                : <>You typed <b>{verbo.trim().toLowerCase()}</b>, which is {(NOMBRE_DE_FORMA[revision.forma] || {}).en || 'a form'} of <b>{revision.base}</b>. These are the forms of <b>{revision.base}</b>.</>}
          </p>
        )}

        {/* NO LO RECONOCEMOS. Avisa y NO bloquea, que es la regla del profesor:
            el pozo son 234 formas base y un verbo legítimo que no esté en él no
            puede dejar a nadie sin poder trabajar. Lo que cambia es que las
            formas de abajo dejan de presentarse como un hecho. */}
        {(revision.tipo === 'noEsVerbo' || revision.tipo === 'dudoso') && (
          <div className="mb-2 rounded-lg border border-amber-400 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-700">
            <p>
              {/* SI EL VALIDADOR TIENE ALGO PRECISO QUE DECIR, MANDA LO SUYO.
                  Ante «wait for» sabe que «for» va en el complemento —que es lo
                  mismo que enseña Desgramatizador al pintar la oración— y ante
                  dos verbos seguidos sabe cuál sobra. Sustituir eso por «no lo
                  reconocemos» sería cambiar una respuesta útil por una educada. */}
              {revision.aviso
                ? revision.aviso
                : revision.tipo === 'dudoso'
                  ? (es ? <><b>{verbo.trim().toLowerCase()}</b> existe en inglés, pero no lo tenemos como verbo.</>
                        : <><b>{verbo.trim().toLowerCase()}</b> is an English word, but not one we have as a verb.</>)
                  : (es ? <>No reconocemos <b>{verbo.trim().toLowerCase()}</b> como verbo.</>
                        : <>We don’t recognise <b>{verbo.trim().toLowerCase()}</b> as a verb.</>)}
              {' '}
              {es ? 'Las formas de abajo son la regla aplicada tal cual: si el verbo existe, estarán bien salvo que sea irregular; si hay una errata, estarán mal.'
                  : 'The forms below are the rule applied as is: if the verb exists they will be right unless it is irregular; if there is a typo they will be wrong.'}
            </p>
            {revision.sugerencias.length > 0 && (
              <p className="mt-1.5 flex flex-wrap items-center gap-1">
                <span>{es ? '¿Querías decir' : 'Did you mean'}</span>
                {revision.sugerencias.map(s => (
                  <button key={s} onClick={() => setVerbo(s)}
                    className="px-1.5 py-0.5 rounded bg-white border border-amber-400 font-semibold hover:border-amber-600">
                    {s}
                  </button>
                ))}
                <span>?</span>
              </p>
            )}
          </div>
        )}

        {/* Las cinco caben en una fila en pantalla ancha y se parten de dos en
            dos en el teléfono. */}
        <dl className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-3 gap-y-2.5">
          {FILAS_DE_FORMAS.map(fila => {
            const [cabeza, cola] = partirForma(formas[fila.id]);
            return (
              <div key={fila.id}>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {es ? fila.es : fila.en}
                </dt>
                <dd className="text-sm font-bold leading-tight" style={{ color: 'var(--rol-verb)' }}>
                  {cabeza}
                  {cola && <span className="font-normal text-slate-500">{cola}</span>}
                </dd>
              </div>
            );
          })}
        </dl>

        {formas.pasadoDoble && (
          <p className="mt-2 text-[11px] text-slate-600">
            {es ? 'El pasado de «be» se reparte según el sujeto: I/he/she/it → was · you/we/they → were. La barra no es una errata.'
                : 'The past of “be” splits by subject: I/he/she/it → was · you/we/they → were. The slash is not a typo.'}
          </p>
        )}
        {formas.particula && (
          <p className="mt-2 text-[11px] text-slate-600">
            {es ? `Solo cambia «${formas.nucleo}»: la partícula «${formas.particula}» va igual en las seis.`
                : `Only “${formas.nucleo}” changes: the particle “${formas.particula}” is the same in all six.`}
          </p>
        )}
      </div>

      {/* La tabla se desborda a lo ancho en teléfono: scroll propio, para que la
          página no lo haga. */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-slate-600">
              <th className="font-semibold pb-1.5 pr-3">{es ? 'Tiempo' : 'Tense'}</th>
              {COLUMNAS.map(([k, signo, nombre]) => (
                <th key={k} className="font-semibold pb-1.5 pr-3 whitespace-nowrap">
                  <span className="font-mono">{signo}</span> {nombre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.id} className="align-top border-t border-gray-200">
                <td className="py-2 pr-3 min-w-[10rem]">
                  <div className="font-semibold text-gray-800">{es ? f.nameEs : f.nameEn}</div>
                  {/* Aquí iban el curso y la unidad de cada tiempo («Bás. I · 5A»).
                      Fuera: la casilla de arriba ya recorta la tabla a lo que el
                      curso vio, así que en el caso normal las diez filas repetían
                      un dato que no distingue ninguna de otra, y el que de verdad
                      se busca —para qué sirve el tiempo— quedaba compitiendo con
                      una referencia de planificación que es del profesor. */}
                  <div className="text-muted">{es ? f.descEs : f.descEn}</div>
                </td>
                {MODOS.map(m => {
                  const c = f.celdas[m];
                  const larga = SENTENCE_PART_EXPLANATIONS.verbChanges[c.cambio];
                  return (
                    <td key={m} className="py-2 pr-3 min-w-[11rem]">
                      <div className="text-gray-800">{c.frase}</div>
                      {/* Las piezas van en CHIP con el tinte de su rol, no en texto
                          suelto: a 12px el rose-600 del auxiliar da 4,35:1 sobre el
                          fondo de la página y no pasa AA —lo cazó la sonda de
                          contraste renderizado—. Sobre su propio tinte -100 va con
                          la tinta que los tokens llaman `onTint` (rose-700), que es
                          para lo que existe. Y los tintes -100 se quedan claros a
                          propósito en oscuro, con su tinta oscura: la capa oscura ya
                          lo documenta.

                          AUXILIAR Y VERBO NO PUEDEN PARECERSE, y aquí se parecían.
                          Los roles son familia a propósito —rose y red, vecinos— y
                          en la oración generada eso funciona: son dos palabras
                          sueltas y separadas. Aquí van pegadas, treinta veces, y
                          rose-100 (#ffe4e6) contra red-100 (#fee2e2) es una
                          diferencia que no existe a 12px. Encima los tokens los
                          dejan casi iguales también en tinta: #be123c y #b91c1c.
                          O sea que el matiz NO iba a resolver esto.
                          Se separan por lo que no es matiz:
                            · FORMA — el auxiliar en cápsula redonda con anillo, el
                              verbo en rectángulo; se distinguen incluso en gris.
                            · PESO — el verbo va en su rol PLENO (red-700, tinta
                              blanca) y el auxiliar en tinte claro. Además de
                              distinguirlos dice cuál es el protagonista: la tabla
                              trata de qué le pasa al VERBO.
                            · RÓTULO — «aux» y «verbo» dentro de la propia cápsula.
                              Es lo único que no hay que deducir, y en material de
                              consulta eso vale más que la elegancia de no ponerlo.
                          El rótulo va con la misma tinta que su cápsula, así que
                          no estrena ningún par de contraste que auditar. */}
                      <div className="mt-1 flex flex-wrap items-baseline gap-1">
                        {c.auxiliar && (
                          <span className="inline-flex items-baseline gap-1 px-1.5 py-0.5 rounded-full bg-rose-100 ring-1 ring-rose-300 text-rose-700">
                            <span className="text-[9px] font-bold uppercase tracking-wide">aux</span>
                            <span className="font-semibold">{c.auxiliar}</span>
                          </span>
                        )}
                        <span className="inline-flex items-baseline gap-1 px-1.5 py-0.5 rounded bg-red-700 text-white">
                          <span className="text-[9px] font-bold uppercase tracking-wide">{es ? 'verbo' : 'verb'}</span>
                          <span className="font-semibold">{c.verbo}</span>
                        </span>
                        {FORMA_DE_CELDA(c.cambio, f.id) && (
                          <span className="text-muted" title={larga ? (es ? larga.es : larga.en) : undefined}>
                            {FORMA_DE_CELDA(c.cambio, f.id)[es ? 'es' : 'en']}
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Aquí iba una nota diciendo que los marcadores de cada tiempo viven
          junto al campo Complemento. Fuera: cerraba una tabla de consulta
          mandando a otra pantalla, y la única forma de comprobarlo es irse de
          esta. Quien esté construyendo los tiene delante sin que nadie se lo
          diga. */}
    </div>
  );
}

/**
 * Guía de uso de la app. Reemplaza a la antigua "Guía de Marcadores Temporales":
 * esos marcadores ya viven junto al campo Complemento (chips por tiempo), que es
 * un lugar más contextual, y la sección prometía ayuda de la app pero entregaba
 * una lista de expresiones.
 */
function UsageGuide({ language, cefrLevel }) {
  const es = language === 'es';
  /* La guía escribe sus textos en línea, pero los de la tabla viven en
     translations porque su título lo usa también la cabecera del panel. */
  const t = translations[language];
  const v = themeVariant();

  const Section = ({ title, children }) => (
    <section className="mb-5">
      <h3 className="text-sm font-bold text-gray-800 mb-2">{title}</h3>
      {children}
    </section>
  );

  const steps = es
    ? [['Elige el tiempo verbal y el modo', 'Arriba del todo. El tiempo define la forma del verbo; el modo, si la oración afirma, niega o pregunta.'],
       ['Completa las piezas', 'Sujeto y verbo son obligatorios; el complemento es opcional. El verbo va en forma base (work, no worked): la app lo conjuga.'],
       ['Toca Generar', 'Verás la oración armada y, debajo, cada parte pintada con su color.']]
    : [['Choose the tense and the mode', 'At the very top. The tense sets the verb form; the mode decides whether the sentence states, denies or asks.'],
       ['Fill in the pieces', 'Subject and verb are required; the complement is optional. Type the verb in base form (work, not worked): the app conjugates it.'],
       ['Hit Generate', "You'll see the finished sentence and, below it, each part painted in its colour."]];

  /* El relleno sale de ROLE_FILL, generado desde design-tokens, y no escrito
     aquí. Estaba a mano y se había desviado justo donde más duele: el Sujeto
     llevaba `bg-indigo-600`, que es el color del MODAL; el Verbo `bg-rose-600`,
     que es el del AUXILIAR; y el Complemento `bg-emerald-600`, que no es de
     ningún rol. Esta es la pantalla donde el alumno se aprende el código de
     colores, así que le estaba enseñando uno distinto del que usa la app al
     pintar la oración. Además tres de las cinco no pasaban AA con el blanco
     encima —el ámbar en 2,15:1— y no era casualidad: los pesos inventados eran
     claros porque nadie los había medido contra nada. */
  const roles = [
    { dot: ROLE_FILL.subject, k: 'S', es: 'Sujeto', en: 'Subject', dEs: 'quién realiza la acción', dEn: 'who performs the action' },
    { dot: ROLE_FILL.verb, k: 'V', es: 'Verbo', en: 'Verb', dEs: 'la acción o el estado', dEn: 'the action or state' },
    { dot: ROLE_FILL.complement, k: 'C', es: 'Complemento', en: 'Complement', dEs: 'el resto de la información', dEn: 'the rest of the information' },
    { dot: ROLE_FILL['wh-word'], k: 'WH', es: 'Palabra WH', en: 'WH word', dEs: 'abre una pregunta abierta', dEn: 'opens an open question' },
    { dot: ROLE_FILL.adverb, k: 'A', es: 'Adverbio', en: 'Adverb', dEs: 'frecuencia: always, never…', dEn: 'frequency: always, never…' },
  ];

  const activities = es
    ? [['📝', 'Completa la oración', 'Escribe la frase verbal que falta.'],
       ['✏️', 'Corrige el error', 'La oración trae una falla: encuéntrala y arréglala.'],
       ['🔍', 'Identifica la estructura', 'Reconoce qué tiempo verbal y qué modo tiene.'],
       ['🔄', 'Modo repaso', 'Vuelve sobre lo que más te cuesta, espaciado en el tiempo.']]
    : [['📝', 'Fill in the sentence', 'Type the missing verb phrase.'],
       ['✏️', 'Correct the error', 'The sentence has a flaw: find it and fix it.'],
       ['🔍', 'Identify the structure', 'Recognise which tense and which mode it uses.'],
       ['🔄', 'Review mode', 'Come back to what you find hardest, spaced over time.']];

  return (
    <div className="text-sm">
      <Section title={es ? '¿Cómo se arma una oración?' : 'How do you build a sentence?'}>
        <ol className="space-y-2">
          {steps.map(([head, body], i) => (
            <li key={i} className="flex gap-2.5">
              <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
              <span className="min-w-0">
                <b className="text-gray-800">{head}.</b>{' '}
                <span className="text-gray-600">{body}</span>
              </span>
            </li>
          ))}
        </ol>
      </Section>

{/* Aquí hubo una puerta a la tabla de tiempos, de cuando la tabla no estaba en
          la barra de abajo y había que entrar por algún lado. Ahora tiene su
          propia pestaña, a la vista, y un botón que lleva a una pestaña vecina
          solo enseña que hay dos caminos para lo mismo. */}

      <Section title={es ? 'Los colores del análisis' : 'The analysis colours'}>
        <p className="text-gray-600 mb-2">
          {es ? 'Al generar, cada parte de la oración queda pintada con su color. Son los mismos en toda la suite.'
              : 'Once generated, each part of the sentence is painted in its colour. They are the same across the whole suite.'}
        </p>
        <ul className="grid sm:grid-cols-2 gap-1.5">
          {roles.map(r => (
            <li key={r.k} className="flex items-center gap-2">
              <span className={`shrink-0 w-6 text-center text-[10px] font-bold text-white rounded ${r.dot}`}>{r.k}</span>
              <span className="text-gray-800 font-medium">{es ? r.es : r.en}</span>
              <span className="text-muted text-xs truncate">{es ? r.dEs : r.dEn}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={es ? 'Cómo leer el selector de tiempos' : 'How to read the tense picker'}>
        <p className="text-gray-600 mb-2">
          {es ? 'El color dice CUÁNDO ocurre y el ícono dice CÓMO se presenta la acción.'
              : 'The colour tells you WHEN it happens and the icon tells you HOW the action is presented.'}
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {['present', 'past', 'future'].map(tt => {
            const fam = TENSE_FAMILIES[tt];
            return (
              <span key={tt} className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-lg" style={{ background: fam.bg[v][0], color: 'inherit' }}>
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: fam.color[v] }} aria-hidden="true" />
                <span className="text-gray-800">{fam.label}</span>
              </span>
            );
          })}
        </div>
        <ul className="space-y-1.5">
          {ASPECTS.map((a, i) => {
            const step = TENSE_FAMILIES.present.bg[v][i];
            return (
              <li key={a.id} className="flex items-center gap-2">
                <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-[11px] font-bold"
                      style={{ background: step, color: readableInk(step) }} aria-hidden="true">{a.icon}</span>
                <b className="text-gray-800">{a.label}</b>
                <span className="text-muted text-xs">
                  {es
                    ? ['(un solo verbo: works, played)', '(en curso: is working)', '(con have/has/had: has worked)', '(ambas cosas: has been working)'][i]
                    : ['(a single verb: works, played)', '(in progress: is working)', '(with have/has/had: has worked)', '(both at once: has been working)'][i]}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={es ? 'Los tres modos' : 'The three modes'}>
        <ul className="space-y-1.5 text-gray-600">
          <li><b className="text-gray-800">{es ? 'Afirmativa' : 'Affirmative'}</b>: <i>She works here.</i></li>
          <li><b className="text-gray-800">{es ? 'Negativa' : 'Negative'}</b>: <i>She doesn't work here.</i></li>
          <li><b className="text-gray-800">{es ? 'Interrogativa' : 'Interrogative'}</b>: <i>Does she work here?</i> {es ? 'Al elegirla aparecen las palabras WH para preguntas abiertas.' : 'Choosing it reveals the WH words for open questions.'}</li>
        </ul>
      </Section>

      <Section title={es ? 'Verbos modales' : 'Modal verbs'}>
        <p className="text-gray-600">
          {es ? 'Son opcionales y reemplazan al tiempo verbal: can, must, should… Al elegir uno, el selector de tiempos se desactiva, porque el modal ya define la forma del verbo (siempre en base: she can work).'
              : 'They are optional and replace the tense: can, must, should… Picking one disables the tense selector, because the modal already sets the verb form (always base: she can work).'}
        </p>
      </Section>

      <Section title={es ? 'La sección Práctica' : 'The Practice section'}>
        <ul className="space-y-1.5">
          {activities.map(([icon, head, body]) => (
            <li key={head} className="flex gap-2">
              <span className="shrink-0">{icon}</span>
              <span><b className="text-gray-800">{head}</b> <span className="text-gray-600">{body}</span></span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

const COMPLEMENT_CHIPS = {
  'simple-present':             ['every day', 'on Mondays', 'in the morning', 'at work', 'at home'],
  'present-continuous':         ['right now', 'at the moment', 'this week', 'today'],
  'simple-past':                ['yesterday', 'last week', 'two days ago', 'last year', 'in 2020'],
  'future-going-to':            ['tomorrow', 'next week', 'this weekend', 'soon', 'next month'],
  'present-perfect':            ['already', 'just', 'never', 'recently', 'so far', 'yet'],
  'past-continuous':            ['yesterday at 8', 'last night', 'all morning', 'at that moment'],
  'simple-future':              ['tomorrow', 'next year', 'soon', 'in the future', 'next month'],
  'past-perfect':               ['before she arrived', 'already', 'by then', 'when I called'],
  'used-to':                    ['when I was a child', 'years ago', 'as a kid', 'in those days'],
  'present-perfect-continuous': ['for two hours', 'since this morning', 'all day', 'since Monday'],
};

// Adverbios de sentido negativo: combinados con el modo negativo producen
// doble negación ("She doesn't never work"), así que se excluyen en ese modo
const NEGATIVE_SENSE_ADVERBS = ['never', 'hardly ever', 'rarely', 'seldom'];

// Distancia de edición entre dos palabras, usada por el corrector ortográfico.
// Pura y sin dependencias de props/estado — no hace falta recrearla en cada render.
// Fórmulas estructurales por tiempo verbal y modo (S/V/C = sujeto/verbo/complemento)
const TENSE_FORMULAS = {
  'simple-present':             { aff: 'S + V(s/es) + C',                          neg: 'S + do/does not + V + C',                    int: 'Do/Does + S + V + C?' },
  'present-continuous':         { aff: 'S + am/is/are + V(ing) + C',               neg: 'S + am/is/are + not + V(ing) + C',            int: 'Am/Is/Are + S + V(ing) + C?' },
  'simple-past':                { aff: 'S + V(past) + C',                          neg: 'S + did not + V + C',                         int: 'Did + S + V + C?' },
  'past-continuous':            { aff: 'S + was/were + V(ing) + C',                neg: 'S + was/were + not + V(ing) + C',             int: 'Was/Were + S + V(ing) + C?' },
  'simple-future':              { aff: 'S + will + V + C',                         neg: 'S + will not + V + C',                        int: 'Will + S + V + C?' },
  'future-going-to':            { aff: 'S + am/is/are + going to + V + C',         neg: 'S + am/is/are + not + going to + V + C',      int: 'Am/Is/Are + S + going to + V + C?' },
  'present-perfect':            { aff: 'S + have/has + V(pp) + C',                 neg: 'S + have/has + not + V(pp) + C',              int: 'Have/Has + S + V(pp) + C?' },
  'past-perfect':               { aff: 'S + had + V(pp) + C',                      neg: 'S + had + not + V(pp) + C',                   int: 'Had + S + V(pp) + C?' },
  'present-perfect-continuous': { aff: 'S + have/has + been + V(ing) + C',         neg: 'S + have/has + not + been + V(ing) + C',      int: 'Have/Has + S + been + V(ing) + C?' },
  'used-to':                    { aff: 'S + used to + V + C',                      neg: 'S + did not + use to + V + C',                int: 'Did + S + use to + V + C?' },
};

// Explicaciones (ES/EN) de cada parte de la oración, usadas en el desglose visual.
// Estático — no depende de props/estado, el idioma se elige en el punto de uso.
const SENTENCE_PART_EXPLANATIONS = {
  subject: {
    es: `Sujeto de la oración`,
    en: `Subject of the sentence`
  },
  auxiliary: {
    'am': { es: 'Verbo "to be" para 1ra persona singular (I)', en: '"To be" verb for 1st person singular (I)' },
    'is': { es: 'Verbo "to be" para 3ra persona singular (he/she/it)', en: '"To be" verb for 3rd person singular (he/she/it)' },
    'are': { es: 'Verbo "to be" para plural o "you"', en: '"To be" verb for plural or "you"' },
    'was': { es: 'Verbo "to be" en pasado para singular', en: '"To be" verb in past for singular' },
    'were': { es: 'Verbo "to be" en pasado para plural o "you"', en: '"To be" verb in past for plural or "you"' },
    'do': { es: 'Auxiliar "do" para presente (I/you/we/they)', en: 'Auxiliary "do" for present (I/you/we/they)' },
    'does': { es: 'Auxiliar "does" para 3ra persona singular', en: 'Auxiliary "does" for 3rd person singular' },
    'did': { es: 'Auxiliar "did" para pasado (todas las personas)', en: 'Auxiliary "did" for past (all persons)' },
    'will': { es: 'Auxiliar "will" para futuro simple', en: 'Auxiliary "will" for simple future' },
    'have': { es: 'Auxiliar "have" para tiempos perfectos (I/you/we/they)', en: 'Auxiliary "have" for perfect tenses (I/you/we/they)' },
    'has': { es: 'Auxiliar "has" para tiempos perfectos (3ra persona)', en: 'Auxiliary "has" for perfect tenses (3rd person)' },
    'had': { es: 'Auxiliar "had" para pasado perfecto', en: 'Auxiliary "had" for past perfect' },
    "don't": { es: 'Auxiliar negativo para presente', en: 'Negative auxiliary for present' },
    "doesn't": { es: 'Auxiliar negativo para 3ra persona singular', en: 'Negative auxiliary for 3rd person singular' },
    "didn't": { es: 'Auxiliar negativo para pasado', en: 'Negative auxiliary for past' },
    "won't": { es: 'Auxiliar/Modal negativo para futuro o rechazo', en: 'Negative auxiliary/modal for future or refusal' },
    'going to': { es: 'Estructura "going to" para futuro con intención/plan', en: '"Going to" structure for future with intention/plan' },
    'been': { es: 'Participio de "be" para tiempos perfectos continuos', en: 'Past participle of "be" for perfect continuous tenses' },
    'used to': { es: 'Estructura para hábitos pasados que ya no existen', en: 'Structure for past habits that no longer exist' },
    'use to': { es: 'Forma de "used to" tras el auxiliar did (pierde la -d)', en: 'Form of "used to" after the auxiliary did (drops the -d)' },
    'not': { es: 'Partícula negativa', en: 'Negative particle' },
    // Modales
    'can': { es: 'Modal "can" - expresa habilidad o posibilidad', en: 'Modal "can" - expresses ability or possibility' },
    'could': { es: 'Modal "could" - habilidad pasada, posibilidad o cortesía', en: 'Modal "could" - past ability, possibility, or politeness' },
    'should': { es: 'Modal "should" - consejo u obligación moral', en: 'Modal "should" - advice or moral obligation' },
    'would': { es: 'Modal "would" - ofrecimientos, condicional o cortesía', en: 'Modal "would" - offers, conditional, or politeness' },
    'must': { es: 'Modal "must" - obligación fuerte o certeza', en: 'Modal "must" - strong obligation or certainty' },
    'may': { es: 'Modal "may" - permiso formal o posibilidad', en: 'Modal "may" - formal permission or possibility' },
    'might': { es: 'Modal "might" - posibilidad remota', en: 'Modal "might" - remote possibility' },
    'shall': { es: 'Modal "shall" - sugerencia u ofrecimiento formal', en: 'Modal "shall" - suggestion or formal offer' },
    // Modales negativos
    "can't": { es: 'Modal negativo - inhabilidad o imposibilidad', en: 'Negative modal - inability or impossibility' },
    "couldn't": { es: 'Modal negativo - inhabilidad pasada o imposibilidad', en: 'Negative modal - past inability or impossibility' },
    "shouldn't": { es: 'Modal negativo - consejo en contra', en: 'Negative modal - advice against' },
    "wouldn't": { es: 'Modal negativo - rechazo condicional', en: 'Negative modal - conditional refusal' },
    "mustn't": { es: 'Modal negativo - prohibición', en: 'Negative modal - prohibition' },
  },
  verbChanges: {
    'base': { es: 'Verbo en forma base (infinitivo sin "to")', en: 'Verb in base form (infinitive without "to")' },
    'third-person-s': { es: 'Se añade "-s" para 3ra persona singular en presente', en: '"-s" is added for 3rd person singular in present' },
    'ing': { es: 'Se añade "-ing" para formar el gerundio/participio presente', en: '"-ing" is added to form the gerund/present participle' },
    'past': { es: 'Verbo conjugado en pasado simple', en: 'Verb conjugated in simple past' },
    'participle': { es: 'Verbo en participio pasado', en: 'Verb in past participle' },
    'irregular': { es: 'Verbo irregular (no sigue la regla -ed)', en: 'Irregular verb (does not follow -ed rule)' },
  }
};

/* Nivel e idioma compartidos con la suite (mismo origen => mismo localStorage).
   El Hub escribe gh_level; standalone, Grammaster los recuerda igual en vez de
   arrancar siempre en 'es'/'basico1'. Se valida lo leído por si quedó un valor
   de otra versión. */
const GH_LEVELS = ['basico1', 'basico2', 'elemental1', 'elemental2', 'intermedio1', 'intermedio2', 'avanzado'];
/* El rótulo corto de cada curso. Estaba escrito a mano en las siete <option> del
   selector; ahora lo comparten el selector y la tabla de tiempos. */
const CURSO_LABEL = {
  basico1:     { es: 'Bás. I',      en: 'Bas. I' },
  basico2:     { es: 'Bás. II',     en: 'Bas. II' },
  elemental1:  { es: 'Elem. I',     en: 'Elem. I' },
  elemental2:  { es: 'Elem. II',    en: 'Elem. II' },
  intermedio1: { es: 'Inter. I',    en: 'Int. I' },
  intermedio2: { es: 'Inter. II',   en: 'Int. II' },
  avanzado:    { es: 'Inter. Alto', en: 'Upper' },
};
const cursoLabel = (id, lang) => (CURSO_LABEL[id] || {})[lang] || id;
const readShared = (key, valid, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return valid.includes(v) ? v : fallback;
  } catch { return fallback; }
};
const writeShared = (key, v) => {
  try { localStorage.setItem(key, v); } catch { /* modo privado */ }
};

const EnglishSentenceBuilder = () => {
  const [language, setLanguageState] = useState(() => readShared('gh_lang', ['es', 'en'], 'es'));
  const [fromHub, setFromHub] = useState(() => window.self !== window.top);
  const setLanguage = (v) => { setLanguageState(v); writeShared('gh_lang', v); };
  const [subject, setSubject] = useState('');
  const [verb, setVerb] = useState('');
  const [complement, setComplement] = useState('');
  const [selectedTense, setSelectedTense] = useState('');
  const [selectedMode, setSelectedMode] = useState('affirmative');
  /* CONDICIONALES. Cruzan con el signo en vez de ser un modo hermano: se puede
     armar una condicional afirmativa, negativa o interrogativa. Y la condición
     lleva su PROPIO negador, porque negar la condición («si no llueve») no es
     lo mismo que negar el resultado («no me quedaré»).

     `tipoCond` es UNA sola fuente de verdad (null · 1 · 2 · 3) y `esCondicional`
     se deriva. Antes eran dos estados y un interruptor aparte que vivía DESPUÉS
     del selector de tiempos al que reemplazaba: había que apretar algo a la
     derecha para que desapareciera lo de la izquierda. Ahora la condicional es
     una familia más DENTRO del selector, que es donde `tokens.json` la tenía
     definida desde el principio. */
  const [tipoCond, setTipoCond] = useState(null);
  const esCondicional = tipoCond != null;
  const [condNeg, setCondNeg] = useState(false);
  const [condSubject, setCondSubject] = useState('');
  const [condVerb, setCondVerb] = useState('');
  const [condComplement, setCondComplement] = useState('');
  const [selectedModal, setSelectedModal] = useState('');
  const [whWord, setWhWord] = useState('');
  const [whExtension, setWhExtension] = useState('');
  const [whWarning, setWhWarning] = useState('');
  /* Mientras falte el sustantivo, la extensión no entra en la oración: se arma
     «What does she like?», que sí es correcta, y el selector pide lo que falta.
     La regla vive en data/grammar.js, junto a las sugerencias que la disparan. */
  const whExtIncompleta = whExtPideSustantivo(whExtension);
  const whExtUsable = whExtIncompleta ? '' : whExtension.trim();
  /* La pregunta de sujeto YA NO es un cuarto modo. Con los dos ejes es forma `?`
     + tipo abierta, así que salió de la barra de formas —donde figuraba como un
     cuarto valor de una variable que solo tiene tres— y pasó a ser un
     interruptor junto a la wh-word, que es de lo que habla.
     Tiene que ser una elección del alumno y no algo deducible: «Who called you?»
     y «Who did you call?» usan la misma palabra. */
  const [whEsSujeto, setWhEsSujeto] = useState(false);
  const whDisponibles = whWords.filter(wh => wh.id);
  /* Lo derivado va más abajo, junto a `cefrLevel`: el curso decide si la
     pregunta de sujeto se ofrece siquiera, y ese estado se declara después. */
  const [selectedAdverb, setSelectedAdverb] = useState('');
  const [generatedSentence, setGeneratedSentence] = useState('');
  const [semanticWarning, setSemanticWarning] = useState(null);
  const [showTimeGuide, setShowTimeGuide] = useState(false);
  const [isIrregular, setIsIrregular] = useState(false);
  const { speak, stop: stopSpeaking, isSpeaking } = useSpeechSynthesis();
  const [speechRate, setSpeechRate] = useState(0.9);

  // FASE 1: Nuevos estados
  const [sentenceHistory, setSentenceHistory] = useLocalStorage('sentenceHistory', []);
  const [confirmClear, setConfirmClear] = useState(false);   // "¿Seguro?" del historial
  const confirmClearTimer = useRef(null);
  const [showHistory, setShowHistory] = useState(false);
  const { stats: sessionStats, totalAllTime, incrementStats } = useSessionStats();
  const [showVerbSuggestions, setShowVerbSuggestions] = useState(false);
  const { copy: copyToClipboard, copied } = useClipboard();
  
  // Corrector ortográfico
  const [spellingErrors, setSpellingErrors] = useState({
    subject: [],
    verb: [],
    complement: []
  });

  /* Mayúsculas, en su propio estado y no dentro de spellingErrors. Son dos
     avisos distintos y decirlo mal enseña mal: «¿quisiste decir…?» supone que
     la palabra está mal escrita, y «january» está perfectamente escrita — lo
     que falla es que el español no capitaliza los meses y el inglés sí. Ver la
     cabecera de capitals-engine.js. */
  const [capsErrors, setCapsErrors] = useState({
    subject: [],
    verb: [],
    complement: []
  });

  // FASE 2: Nuevos estados
  const [practiceMode, setPracticeMode] = useState(false);
  const [practiceType, setPracticeType] = useState('');
  /* `''` = mezcla (lo normal y lo que mejor retiene); un id de tiempo = práctica
     focalizada en ese contenido. No se guarda entre sesiones a propósito: es una
     decisión del momento («hoy quiero machacar el presente perfecto»), no un
     ajuste del alumno como el nivel o la unidad. */
  const [practiceTema, setPracticeTema] = useState('');
  const [practiceQuestion, setPracticeQuestion] = useState(null);
  const [practiceAnswer, setPracticeAnswer] = useState('');
  const [practiceResult, setPracticeResult] = useState(null);
  const [answerStreak, setAnswerStreak] = useState(0);   // racha de aciertos consecutivos (inline)
  /* Rondas de práctica. Antes la sesión no terminaba nunca: nextPractice
     generaba otro ejercicio indefinidamente, sin cuenta ni cierre, así que el
     alumno no sabía si iba por la mitad o recién empezando y no tenía dónde
     parar. Diez ejercicios son 3-5 minutos, la misma dosis que en Question Lab
     y la que el banco de frases le predica al que estudia de noche. */
  const RONDA = 10;
  const [ronda, setRonda] = useState({ hechos: 0, ok: 0, mejor: 0 });
  /* `hechos` sube al verificar, así que mientras se muestra la corrección hay un
     ejercicio contado que el alumno todavía tiene en pantalla. De ahí salen dos
     cosas distintas: `rondaTerminada` espera a que pida el siguiente (si no, el
     resumen se comía la corrección del ejercicio 10) y el rótulo nombra el
     ejercicio visible, que antes saltaba al verificar y hacía parecer 11. */
  const rondaTerminada = ronda.hechos >= RONDA && !practiceResult;
  const rondaEnPantalla = Math.min(ronda.hechos + (practiceResult ? 0 : 1), RONDA);
  const [badgeToasts, setBadgeToasts] = useState([]);   // gamificación de suite
  const [identifyTenseAnswer, setIdentifyTenseAnswer] = useState('');
  const [identifyModeAnswer, setIdentifyModeAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [cefrLevel, setCefrLevelState] = useState(() => readShared('gh_level', GH_LEVELS, 'basico1'));
  /* HASTA DÓNDE VA EL CURSO. `null` = no lo ha dicho todavía; `''` = eligió ver
     el curso entero. La diferencia importa: con `null` la práctica lo pregunta
     una vez, con `''` ya respondió y no se vuelve a preguntar.
     Se guarda compartido (mismo mecanismo que el nivel) para que cuando esto se
     propague a las otras apps no haya que preguntarlo cuatro veces. */
  const [unidadCurso, setUnidadCursoState] = useState(() => {
    try { return localStorage.getItem('gh_unidad'); } catch { return null; }
  });
  /* REVISIÓN PERIÓDICA. Este dato caduca solo: el curso avanza ~una unidad por
     clase y hay dos clases por semana (los intensivos, tres o cuatro), así que
     a los siete días está corrido y nadie lo mueve. El alumno no tiene por qué
     acordarse de un ajuste que puso una vez.
     Y el fallo es SILENCIOSO Y SIEMPRE HACIA EL MISMO LADO: una unidad vieja
     solo puede hacer la app más chica. No sale ningún error; queda una app
     congelada en la semana 3 que esconde justo lo que se vio en la última
     clase, que es cuando más se querría practicar.
     A los 7 días la línea vuelve a ser tarjeta y pregunta si siguen ahí.
     Con `''` (todo el curso) no se pregunta: ahí no hay nada escondido, así que
     no hay nada que se pueda quedar viejo. Sin fecha guardada = por revisar,
     que es el caso de quien ya tenía unidad antes de que esto existiera.
     `todayISO` sale del motor de progreso y no de una copia local: es fecha
     LOCAL y no UTC, distinción que costó encontrar con la racha del que estudia
     de noche, y dos implementaciones del mismo día acabarían divergiendo. Por
     lo mismo el PLAZO viene de curriculum.json y la REGLA de grammar.js, junto
     a `estaVisto`: las dos apps deciden esto igual o no lo deciden. */
  const [unidadFecha, setUnidadFechaState] = useState(() => {
    try { return localStorage.getItem('gh_unidad_fecha'); } catch { return null; }
  });
  const sellarUnidadFecha = () => {
    const hoy = todayISO();
    setUnidadFechaState(hoy);
    try { localStorage.setItem('gh_unidad_fecha', hoy); } catch { /* modo privado */ }
  };
  const hayQueRevisarUnidad = unidadPorRevisar(unidadCurso, unidadFecha, todayISO());
  const setUnidadCurso = (v) => {
    setUnidadCursoState(v);
    try { localStorage.setItem('gh_unidad', v); } catch { /* modo privado */ }
    sellarUnidadFecha();
  };
  /* El nivel vigente en un ref, no solo en el estado: el `handler` del
     postMessage del Hub se registra una vez (`useEffect` con []), así que lee
     para siempre el `cefrLevel` del primer render. Comparar contra el estado
     ahí daría falsos «ha cambiado». */
  const nivelRef = useRef(cefrLevel);
  useEffect(() => { nivelRef.current = cefrLevel; }, [cefrLevel]);
  const setCefrLevel = (v) => {
    /* Solo si CAMBIA de verdad. El Hub reenvía el nivel por postMessage cada
       vez que carga el iframe, y sin esta guarda cada visita desde el Hub
       borraba la unidad del curso — el alumno la ponía y desaparecía sola. */
    if (v === nivelRef.current) return;
    nivelRef.current = v;
    setCefrLevelState(v); writeShared('gh_level', v);
    /* Cambiar de curso reinicia la unidad: «9A» de Intermedio II no significa
       nada en Básico I, y arrastrarla dejaría un filtro silencioso y falso. */
    setUnidadCursoState(null);
    try { localStorage.removeItem('gh_unidad'); } catch { /* modo privado */ }
  };

  /* Un contenido está disponible si es de un curso ANTERIOR (ya lo vio entero) o
     si es del curso actual y su unidad no pasa de donde va la clase. */
  const unidadTope = unidadCurso ? unidadIndice(unidadCurso) : Infinity;
  const esCursoActual = (item) => COURSE_ORDER.indexOf(item.cefr) === COURSE_ORDER.indexOf(cefrLevel);
  /* La regla vive en `data/grammar.js` y es la MISMA para todas las actividades.
     Estaba escrita aquí dentro y el modo repaso se hizo su propia versión más
     floja; ver el comentario de `estaVisto`. */
  const yaVisto = (item) => estaVisto(item, cefrLevel, unidadCurso);
  /* El tiempo está visto SOLO con `be`: la etapa temprana ya pasó pero la de los
     demás verbos no. Practicarlo con «work» sería preguntar por lo que aún no
     se ha enseñado; con `be` es exactamente lo que sabe. */
  const soloBe = (item) => !!item && item.unidadBe != null && esCursoActual(item)
    && unidadIndice(item.unidadBe) <= unidadTope
    && unidadIndice(item.unidad) > unidadTope;

  /* La pregunta de sujeto, derivada (ver `whEsSujeto` más arriba). Se OFRECE
     solo cuando tiene sentido ofrecerla: forma `?`, una wh que pueda ejecutar la
     acción, y desde el curso donde se enseña (AEF Intermedio II 12C). Con una
     condicional puesta no se ofrece, y ahora eso es estructural: el resultado de
     una condicional siempre lleva auxiliar, y el rasgo de la pregunta de sujeto
     es NO tenerlo. Antes esa exclusión hacía desaparecer un segmento de la barra
     sin decir por qué. */
  const puedeSerPregSujeto = selectedMode === 'interrogative' && !esCondicional
    && whSubjectWords.includes(whWord)
    && COURSE_ORDER.indexOf('intermedio2') <= COURSE_ORDER.indexOf(cefrLevel);
  const esPregSujeto = puedeSerPregSujeto && whEsSujeto;
  /* El motor sigue hablando de `subject-question` —es su vocabulario, y lo fijan
     los tests—; lo que cambió es de dónde sale. */
  const modoMotor = esPregSujeto ? 'subject-question' : selectedMode;
  const [notification, setNotification] = useState(null); // { type: 'error' | 'success', message: string }

  const [practiceDays, setPracticeDays] = useLocalStorage('practiceDays', []); // array of 'YYYY-MM-DD' strings
  const [srsData, setSrsData] = useLocalStorage('srsData', {}); // { 'tenseId|mode': { lastPracticed, timesCorrect, timesWrong, interval } }
  const [reviewUpToDate, setReviewUpToDate] = useState(false);

  // UI simplificada
  /* A la tabla de tiempos se entra por SU pestaña, entre Guía y Práctica, y por
     ningún otro sitio. Tuvo dos puertas más —un botón dentro de la Guía y un
     `#tiempos` que abría el hub desde las herramientas de clase— y las dos eran
     de cuando no estaba en la barra: una cosa que se ve no necesita que la
     abran desde fuera, y tres caminos al mismo panel son tres sitios donde
     buscarla. */
  const [activePanel, setActivePanel] = useState(null);
  // 'history', 'practice', 'guide', 'settings', 'progress', 'tiempos'

  // Análisis gramatical visual
  const [sentenceAnalysis, setSentenceAnalysis] = useState(null);
  const [showAnalysisDetails, setShowAnalysisDetails] = useState(false);
  const [selectedPartIndex, setSelectedPartIndex] = useState(null); // parte tocada/enfocada en la oración coloreada (accesible en táctil/teclado)
  const [allModeSentences, setAllModeSentences] = useState(null);
  const [showAllModes, setShowAllModes] = useState(false);

  // Validación de entradas
  /* NOMBRES DEL CURSO. Salió en clase: «Jans» se conjugaba en plural, porque una
     palabra desconocida terminada en -s es ambigua y la app no puede saberlo.
     En vez de adivinar, lo pregunta una vez y lo recuerda. Clave compartida con
     la suite: un nombre es un nombre en las cuatro apps.
     El registro se hace en el inicializador para que la PRIMERA conjugación ya
     lo tenga: si esperara a un efecto, la oración se generaría una vez mal. */
  const [nombresPropios, setNombresPropios] = useState(() => {
    let l = [];
    try { l = JSON.parse(localStorage.getItem('gh_nombres') || '[]'); } catch { l = []; }
    if (!Array.isArray(l)) l = [];
    registrarNombres(l);
    return l;
  });
  const agregarNombre = (n) => {
    const lista = [...new Set([...nombresPropios, String(n).toLowerCase().trim()])];
    registrarNombres(lista);
    setNombresPropios(lista);
    try { localStorage.setItem('gh_nombres', JSON.stringify(lista)); } catch { /* modo privado */ }
  };
  /* ── REPORTAR UN PROBLEMA ────────────────────────────────────────────────
     Pedido del profesor después de la primera clase. La app es un archivo
     estático en GitHub Pages: NO hay servidor, así que no puede enviar nada por
     su cuenta, y un enlace `mailto:` tampoco adjunta imágenes.
     Lo que sí puede, y vale más que un pantallazo, es volcar el ESTADO EXACTO
     con el que falló: eso se pega tal cual en un test, una foto no. */
  const [reporte, setReporte] = useState(null);
  const [reporteCopiado, setReporteCopiado] = useState(false);
  /* ¿HAY ALGO QUE REPORTAR? El botón salía en las cinco pestañas, también en la
     Guía o en Progreso sin haber generado nada, y ahí el informe era el
     encabezado y poco más: versión, curso, idioma y una lista de campos vacíos.
     Un botón que no hace nada enseña a no tocarlo, y el día que sí haga falta
     ya nadie lo usa.
     Se reporta lo que la app PRODUJO **y donde está**: la oración generada en
     el constructor, el ejercicio en Práctica. El panel SÍ importa —lo dijo el
     profesor al probarlo: cambiar de pestaña y seguir viendo el botón—, porque
     en la Guía, el Progreso o el Historial no hay nada delante de lo que
     quejarse aunque el constructor tenga algo guardado. Es el mismo criterio
     que Question Lab, donde el informe es por panel. */
  const hayQueReportar =
    (activePanel === null && !!generatedSentence) ||
    (activePanel === 'practice' && !!practiceQuestion);
  const construirReporte = () => {
    const linea = (k, v) => (v == null || v === '' ? null : `${k}: ${v}`);
    const p = practiceQuestion;
    return [
      `Grammaster ${APP_VERSION}`,
      linea('Curso', cefrLevel),
      linea('Unidad', unidadCurso || (unidadCurso === '' ? 'todo el curso' : 'sin responder')),
      linea('Idioma', language),
      p ? `— PRÁCTICA (${practiceType}) —` : '— CONSTRUCTOR —',
      p ? linea('Tipo de ejercicio', p.type) : null,
      p ? linea('Ejercicio', p.wrongSentence || p.fullSentence || '') : linea('Tiempo', esCondicional ? `condicional ${tipoCond}` : selectedTense),
      /* En «corrige el error» la oración de pantalla lleva un fallo puesto a
         propósito: sin saber CUÁL, el reporte parece decir que la app genera
         mal. */
      p && p.type === 'correct' ? linea('Error plantado', `${p.wrongPart} → ${p.correctAnswer}`) : null,
      p && p.type === 'correct' ? linea('Oración buena', p.fullSentence) : null,
      p ? linea('Tiempo', p.tense && p.tense.id) : linea('Modal', selectedModal),
      p ? linea('Forma', p.mode) : linea('Forma', selectedMode),
      /* QUÉ CONTESTÓ EL ALUMNO Y CÓMO SE CORRIGIÓ. Faltaba entero: el reporte
         decía qué esperaba la app pero no qué le habían dado ni qué veredicto
         puso, así que no se podía saber si el fallo era del alumno o de la
         corrección, que es exactamente lo que se reporta desde práctica.
         El de identificar responde con dos desplegables y no con texto, así que
         su respuesta son otros campos. */
      p && p.type === 'identify' ? linea('Marcó', `tiempo ${identifyTenseAnswer || '—'} · forma ${identifyModeAnswer || '—'}`) : null,
      p && p.type !== 'identify' ? linea('Contestó', practiceAnswer || '(nada)') : null,
      p ? linea('Esperaba', p.correctAnswer) : linea('Wh', [whWord, whExtension].filter(Boolean).join(' ')),
      /* Y las OTRAS formas que también daba por buenas: un reporte que enseña
         una sola hace pensar que la app rechaza alternativas legítimas cuando
         a lo mejor las acepta. */
      p && p.acceptedAnswers && p.acceptedAnswers.length > 1
        ? linea('También aceptaba', p.acceptedAnswers.filter(a => a !== p.correctAnswer).join(' / ')) : null,
      p ? linea('Corregido', practiceResult
            ? (practiceResult.correct ? 'sí, lo dio por bueno' : 'sí, lo dio por malo')
            : 'todavía no') : null,
      /* La ronda sitúa el fallo dentro de la sesión y dice qué racha se perdió. */
      p ? linea('Ronda', `${ronda.hechos}/${RONDA} · ${ronda.ok} bien · racha ${answerStreak}`) : null,
      p ? null : linea('Sujeto', subject),
      p ? null : linea('Verbo', verb),
      p ? null : linea('Complemento', complement),
      p ? null : linea('Salió', generatedSentence),
      '—',
      linea('Navegador', typeof navigator !== 'undefined' ? navigator.userAgent : ''),
      '',
      language === 'es' ? 'Qué esperaba en vez de eso:' : 'What I expected instead:',
      '',
    ].filter(Boolean).join('\n');
  };
  const copiarReporte = async () => {
    try { await navigator.clipboard.writeText(reporte); setReporteCopiado(true); }
    catch { setReporteCopiado(false); }
  };
  /* La dirección se arma al pulsar y NO está escrita entera en el HTML: los
     rastreadores de spam leen el código publicado, y esta es una cuenta
     personal. No es paranoia, es lo que le pasa a cualquier `mailto:` a la
     vista. */
  const abrirCorreo = () => {
    const destino = ['v.moralesm', 'profesor.duoc.cl'].join('@');
    const asunto = language === 'es' ? 'Grammaster: reporte de un problema' : 'Grammaster: problem report';
    window.location.href = `mailto:${destino}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(reporte)}`;
  };

  /* CONTRAER LA NEGATIVA. Por defecto SÍ, que es lo natural y lo que enseña el
     libro. La entera existe porque el profesor la quiere para explicar la
     estructura, y esa es una decisión de clase, no de la app.
     Clave compartida: si la elige aquí, Question Lab la respeta en su respuesta
     modelo. Que las dos apps escriban distinto la misma negación es justo lo
     que veníamos arreglando.
     Solo afecta a lo que se MUESTRA: el corrector de la práctica acepta las dos
     formas desde siempre, así que nadie ve un error nuevo por esto. */
  const [contraer, setContraerState] = useState(() => {
    try { return localStorage.getItem('gh_contraccion') !== 'entera'; } catch { return true; }
  });
  const setContraer = (v) => {
    setContraerState(v);
    try { localStorage.setItem('gh_contraccion', v ? 'contraida' : 'entera'); } catch { /* modo privado */ }
  };
  /* Un solo sitio por donde pasa todo lo que se enseña en pantalla. */
  const txt = (s) => (contraer ? s : expandirNegacion(s));

  const [subjectValidation, setSubjectValidation] = useState({ valid: true, warning: null });
  /* Depende de `nombresPropios` aunque no lo use: el registro que consulta
     `nombreAmbiguo` vive en el módulo de conjugación y no es reactivo, así que
     sin esta dependencia el aviso no desaparecería al declarar el nombre. */
  const sujetoAmbiguo = useMemo(() => nombreAmbiguo(subject), [subject, nombresPropios]);
  const [verbValidation, setVerbValidation] = useState({ valid: true, warning: null });
  /* El primer toque a Generar con un verbo dudoso no genera: arma el botón y
     pone el motivo encima. Ver `revisarVerboAntesDeGenerar` en validation.js. */
  const [confirmVerbo, setConfirmVerbo] = useState(false);
  const [verbBaseSuggestion, setVerbBaseSuggestion] = useState(null);
  const [complementValidation, setComplementValidation] = useState({ valid: true, warning: null });

  const t = translations[language];

  // Mostrar notificación temporal
  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  // Sugerencias de corrección: la lógica vive en spelling.js, con sus pruebas.

  // Función para verificar ortografía en un texto
  const checkSpelling = (text, field) => {
    /* La capitalización se mira sobre el texto ENTERO y no palabra a palabra,
       porque para las ambiguas hace falta el vecino: «may» solo es el mes si
       trae delante una preposición de tiempo. Partiendo por espacios primero,
       esa prueba se pierde. */
    setCapsErrors(prev => ({
      ...prev,
      [field]: revisarMayusculas(text, { canonico: CAPS_CANONICO, ambiguas: CAPS_AMBIGUAS }),
    }));

    if (!text || text.trim().length === 0) {
      setSpellingErrors(prev => ({ ...prev, [field]: [] }));
      return;
    }

    const words = text.split(/[\s,]+/).filter(w => w.length > 0);
    const errors = [];

    /* Qué categoría pide el hueco. Solo desempata entre candidatos que ya están
       a la misma distancia, así que equivocarse aquí no puede sacar una
       sugerencia peor de la nada; acertar sube el acierto del 90% al 99% en las
       erratas de adjetivo. El caso que lo motivó: detrás de «be» el complemento
       es casi siempre un adjetivo, y sin esto «blck» sugería «back» y «smll»
       sugería «sell» — palabras que ni siquiera caben en esa casilla.
       El campo Verbo pide verbo por definición. El Sujeto no se marca: ahí caben
       sustantivos, pronombres y nombres propios por igual. */
    const categoriaDelHueco =
      field === 'verb' ? 'verbo'
        : (field === 'complement' && verb.toLowerCase().trim() === 'be') ? 'adjetivo'
          : null;

    words.forEach(word => {
      const cleanWord = word.replace(/[.,!?;:]/g, '');
      const suggestions = getSpellingSuggestions(cleanWord, { categoria: categoriaDelHueco });

      if (suggestions.length > 0) {
        errors.push({
          word: cleanWord,
          suggestions: suggestions
        });
      }
    });

    setSpellingErrors(prev => ({ ...prev, [field]: errors }));
  };

  // Grammar HUB: escuchar cambio de idioma y nivel vía postMessage
  useEffect(() => {
    const validLevels = GH_LEVELS;
    const handler = (e) => {
      if (e.data?.type === 'GRAMMAR_HUB_LANG' && (e.data.lang === 'es' || e.data.lang === 'en')) {
        setLanguage(e.data.lang);
        setFromHub(true);
      }
      if (e.data?.type === 'GRAMMAR_HUB_LEVEL' && validLevels.includes(e.data.level)) {
        setCefrLevel(e.data.level);
        setFromHub(true);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // FASE 1: Filtrar verbos sugeridos
  const getVerbSuggestions = () => {
    if (!verb) return [];
    const lowerVerb = verb.toLowerCase();
    return commonVerbs.filter(v => v.startsWith(lowerVerb) && v !== lowerVerb).slice(0, 8);
  };

  /* Confirmación en la propia UI, no con window.confirm: dentro del iframe del
     Hub los diálogos nativos están bloqueados y confirm() devuelve false al
     instante, así que el botón no hacía nada. El primer toque arma, el segundo
     borra; se desarma solo a los 4 s. */
  const clearHistory = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      clearTimeout(confirmClearTimer.current);
      confirmClearTimer.current = setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    clearTimeout(confirmClearTimer.current);
    setConfirmClear(false);
    setSentenceHistory([]); // useLocalStorage persiste el array vacío solo
    showNotification('success', language === 'es' ? 'Historial limpiado' : 'History cleared');
  };

  // FASE 1: Eliminar del historial
  const deleteFromHistory = (index) => {
    const newHistory = sentenceHistory.filter((_, i) => i !== index);
    setSentenceHistory(newHistory);
  };

  const formatTimestamp = (iso) => {
    const date = new Date(iso);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return (language === 'es' ? 'Hoy ' : 'Today ') + time;
    if (isYesterday) return (language === 'es' ? 'Ayer ' : 'Yesterday ') + time;
    return date.toLocaleDateString([], { day: '2-digit', month: 'short' }) + ' ' + time;
  };

  const exportHistory = () => {
    if (sentenceHistory.length === 0) return;
    const lines = sentenceHistory.map((item, i) => {
      const tenseName = language === 'es' ? item.config.tense?.nameEs : item.config.tense?.nameEn;
      return `${i + 1}. ${item.sentence}\n   [${tenseName || item.config.modal || ''} · ${item.config.mode} · ${formatTimestamp(item.timestamp)}]`;
    });
    // BOM para que Excel/Notepad no rompan los acentos al abrir el .txt
    const blob = new Blob(['﻿' + lines.join('\n\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'grammaster-historial.txt';
    // Hay que ADJUNTARLO al documento: sin esto Firefox ignora el click.
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revocar de inmediato puede abortar la descarga antes de que arranque.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showNotification('success', language === 'es' ? 'Historial exportado' : 'History exported');
  };

  /* LA FECHA SALE DE `todayISO`, NO DE `toISOString()`.
     Esto llevaba tiempo mal y era el mismo fallo que el motor compartido ya
     documenta y corrigió: `toISOString()` da la fecha de GREENWICH, así que en
     Chile el día cambiaba a las 20:00. Dos fallas, las dos sobre el que estudia
     de noche:
       · practicar lunes 22:00 quedaba anotado como martes;
       · y con eso la racha local y la de la suite mostraban números distintos
         para lo mismo, en la MISMA tarjeta del panel de Progreso.
     El registro propio de días SÍ tiene motivo y se queda: `gh_progress` no
     guarda de qué app fue cada día, y esta tarjeta dice «practicando en
     Grammaster». Lo que sobraba no era el registro, era su forma de fechar. */
  const recordPracticeDay = () => {
    const today = todayISO();
    setPracticeDays(prev => prev.includes(today) ? prev : [...prev, today]);
  };

  // Calcular racha de días consecutivos
  const computeStreak = (days) => {
    if (!days || days.length === 0) return 0;
    const unique = [...new Set(days)].sort().reverse();
    const today = todayISO();
    const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
    const yesterdayStr = todayISO(ayer);
    if (unique[0] !== today && unique[0] !== yesterdayStr) return 0;
    let streak = 1;
    for (let i = 0; i < unique.length - 1; i++) {
      const curr = new Date(unique[i]);
      const prev = new Date(unique[i + 1]);
      const diff = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
      if (diff === 1) streak++;
      else break;
    }
    return streak;
  };

  // Contar usos por tense.id desde el historial
  const computeTenseStats = () => {
    const counts = {};
    sentenceHistory.forEach(item => {
      const id = item.config?.tense?.id;
      if (id) counts[id] = (counts[id] || 0) + 1;
    });
    return counts;
  };

  // Escapar caracteres especiales en RegExp
  const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  /* El aviso de mayúscula, igual en los tres campos. Va en un componente y no
     copiado tres veces por lo de siempre: copiado, uno de los tres se queda
     atrás. Índigo y no ámbar: el ámbar de esta app avisa de que algo puede
     estar MAL, y aquí la palabra está bien escrita — solo le falta la capital.
     Se ofrece el arreglo a un clic porque en clase, delante del curso, no hay
     tiempo de volver al campo a reescribirlo. */
  const AvisoMayuscula = ({ campo }) => {
    const hallazgos = capsErrors[campo];
    if (!hallazgos || !hallazgos.length) return null;
    return (
      <p className="aviso-mayuscula text-xs mt-1 flex items-center gap-1 flex-wrap">
        <AlertTriangle className="w-3 h-3 shrink-0" /> {t.capitalHint}:
        {hallazgos.slice(0, 2).map((h, i) => (
          <button
            key={i}
            onClick={() => applySuggestion(campo, h.palabra, h.sugerida)}
            className="underline font-semibold ml-1"
          >{h.sugerida}</button>
        ))}
      </p>
    );
  };

  // Aplicar sugerencia de corrección
  const applySuggestion = (field, oldWord, newWord) => {
    const escapedOldWord = escapeRegExp(oldWord);
    if (field === 'subject') {
      setSubject(prev => prev.replace(new RegExp(escapedOldWord, 'gi'), newWord));
    } else if (field === 'verb') {
      setVerb(prev => prev.replace(new RegExp(escapedOldWord, 'gi'), newWord));
    } else if (field === 'complement') {
      setComplement(prev => prev.replace(new RegExp(escapedOldWord, 'gi'), newWord));
    }
  };


  // Limpiar tiempo verbal al cambiar de categoría
  useEffect(() => {
    setSelectedTense('');
  }, [cefrLevel]);

  /* La barra de formas ya no necesita filtro: tiene SIEMPRE los tres segmentos y
     no cambia de ancho con el curso ni con la condicional. Los dos efectos que
     reponían el modo cuando un segmento se esfumaba se fueron con ellos.

     Lo que queda es apagar el interruptor cuando deja de ofrecerse — si no, la
     casilla guardaría un «sí» invisible y al volver a `who` la pregunta de
     sujeto se reactivaría sola. */
  useEffect(() => {
    if (!puedeSerPregSujeto && whEsSujeto) setWhEsSujeto(false);
  }, [puedeSerPregSujeto, whEsSujeto]);

  // Limpiar adverbio cuando el tiempo verbal no es compatible
  useEffect(() => {
    if (selectedTense !== 'simple-present' && selectedTense !== 'simple-past') {
      setSelectedAdverb('');
    }
  }, [selectedTense]);

  // Limpiar adverbio cuando se selecciona un modal
  useEffect(() => {
    if (selectedModal) {
      setSelectedAdverb('');
    }
  }, [selectedModal]);

  // En modo negativo, quitar adverbios que producirían doble negación
  useEffect(() => {
    if (selectedMode === 'negative' && NEGATIVE_SENSE_ADVERBS.includes(selectedAdverb)) {
      setSelectedAdverb('');
    }
  }, [selectedMode, selectedAdverb]);

  // Limpiar la palabra WH al salir de interrogativa: si no, queda oculta en
  // el estado y se filtra en la variante "interrogativa" del comparador de
  // los 3 modos aunque el picker de WH ya no esté visible — confuso.
  useEffect(() => {
    if (selectedMode !== 'interrogative') {
      setWhWord('');
      setWhExtension('');
      setWhWarning('');
    }
  }, [selectedMode]);

  // Genera una oración con un error gramatical y retorna { sentence, wrongPart, correctPart }
  const buildWrongSentence = (subj, v, comp, tenseId, mode = 'affirmative') => {
    const is3p = isThirdPersonSingular(subj);
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    const compStr = comp ? ' ' + comp : '';
    const beForm = getBeForm(subj);
    const wasWere = getWasWere(subj);
    const hasHave = getHasHave(subj);
    const sMid = smartCaseSubject(subj); // a mitad de oración: "He" → "he", pero "I" se conserva
    const pp = pastParticiple(v);

    if (mode === 'affirmative') {
      if (tenseId === 'simple-present' && is3p)
        return { sentence: cap(subj) + ' ' + v + compStr + '.', wrongPart: v, correctPart: conjugate3p(v) };
      if (tenseId === 'simple-present' && !is3p)
        return { sentence: cap(subj) + ' ' + conjugate3p(v) + compStr + '.', wrongPart: conjugate3p(v), correctPart: v };
      if (tenseId === 'simple-past')
        return { sentence: cap(subj) + ' ' + v + compStr + '.', wrongPart: v, correctPart: simplePast(v) };
      if (tenseId === 'present-continuous')
        return { sentence: cap(subj) + ' ' + beForm + ' ' + v + compStr + '.', wrongPart: v, correctPart: presentParticiple(v) };
      if (tenseId === 'present-perfect')
        return { sentence: cap(subj) + ' ' + hasHave + ' ' + v + compStr + '.', wrongPart: v, correctPart: pp };
    }

    if (mode === 'negative') {
      if (tenseId === 'simple-present') {
        const wrong = is3p ? "don't" : "doesn't";
        const correct = is3p ? "doesn't" : "don't";
        return { sentence: cap(subj) + ' ' + wrong + ' ' + v + compStr + '.', wrongPart: wrong, correctPart: correct };
      }
      if (tenseId === 'simple-past')
        return { sentence: cap(subj) + " didn't " + simplePast(v) + compStr + '.', wrongPart: simplePast(v), correctPart: v };
      if (tenseId === 'present-continuous')
        return { sentence: cap(subj) + ' ' + beForm + ' not ' + v + compStr + '.', wrongPart: v, correctPart: presentParticiple(v) };
      if (tenseId === 'present-perfect') {
        const wrong = is3p ? 'have' : 'has';
        return { sentence: cap(subj) + ' ' + wrong + ' not ' + pp + compStr + '.', wrongPart: wrong, correctPart: hasHave };
      }
      if (tenseId === 'past-continuous')
        return { sentence: cap(subj) + ' ' + wasWere + ' not ' + v + compStr + '.', wrongPart: v, correctPart: presentParticiple(v) };
    }

    if (mode === 'interrogative') {
      if (tenseId === 'simple-present') {
        const wrong = is3p ? 'Do' : 'Does';
        const correct = is3p ? 'Does' : 'Do';
        return { sentence: wrong + ' ' + sMid + ' ' + v + compStr + '?', wrongPart: wrong, correctPart: correct };
      }
      if (tenseId === 'simple-past')
        return { sentence: 'Did ' + sMid + ' ' + simplePast(v) + compStr + '?', wrongPart: simplePast(v), correctPart: v };
      if (tenseId === 'present-continuous')
        return { sentence: cap(beForm) + ' ' + sMid + ' ' + v + compStr + '?', wrongPart: v, correctPart: presentParticiple(v) };
      if (tenseId === 'present-perfect') {
        const wrong = is3p ? 'Have' : 'Has';
        return { sentence: wrong + ' ' + sMid + ' ' + pp + compStr + '?', wrongPart: wrong, correctPart: cap(hasHave) };
      }
      if (tenseId === 'past-continuous')
        return { sentence: cap(wasWere) + ' ' + sMid + ' ' + v + compStr + '?', wrongPart: v, correctPart: presentParticiple(v) };
    }

    // Fallback
    return { sentence: cap(subj) + ' ' + v + compStr + '.', wrongPart: v, correctPart: v };
  };

  /* ── El pozo del que sale cada ejercicio ──────────────────────────────────
     Vive aquí y no dentro de una actividad porque la práctica Y el repaso (SRS)
     corrigen y puntúan los dos, así que los dos tienen que acotarse igual. El
     repaso tenía su propia lista de diez verbos genéricos y se le escapaba. */
  const courseIndex = COURSE_ORDER.indexOf(cefrLevel);
  const subjects = ['I', 'You', 'He', 'She', 'We', 'They'];
  const alAzar = (lista) => lista[Math.floor(Math.random() * lista.length)];

  /* Los verbos salen de la página 133 del libro, no de una lista inventada, y
     los IRREGULARES solo entran cuando el curso ya los vio: en Básico II los
     regulares son la 11A y los irregulares la 11B, una clase después. Sin esto
     la 11A podía pedir «went» o «wrote». */
  const conIrregulares = (tense) => !(tense && tense.unidadIrregulares != null
    && esCursoActual(tense) && unidadIndice(tense.unidadIrregulares) > unidadTope);
  /* Cada libro suelta más irregulares: doce en Básico (pág. 133), 51 en
     Elemental (pág. 165), 63 en Intermedio (pág. 164) y 71 en Intermedio Alto.
     Sin la escala, un alumno de Básico II recibía «swam» y uno de Elemental
     «threw», que están uno y dos cursos más arriba. */
  const irregularesDelCurso =
    courseIndex <= COURSE_ORDER.indexOf('basico2')    ? VERBOS_IRREGULARES_BASICO
    : courseIndex <= COURSE_ORDER.indexOf('elemental2') ? VERBOS_IRREGULARES
    : courseIndex <= COURSE_ORDER.indexOf('intermedio2') ? VERBOS_IRREGULARES_INTERMEDIO
    : VERBOS_IRREGULARES_AVANZADO;
  /* Los regulares no se escalonan igual: hasta Elemental son los del libro, y
     DESDE INTERMEDIO se abren, porque a esa altura la regla `-ed` ya está
     sabida y los 50 de Starter se quedan cortos (decisión del docente). */
  const regularesDelCurso = courseIndex >= COURSE_ORDER.indexOf('intermedio1')
    ? VERBOS_REGULARES_AMPLIA : VERBOS_REGULARES;
  /* Los que la estructura no puede armar salen aquí y no de las listas: esas son
     copia del libro y hay tests que las cruzan contra sus páginas. */
  const armables = (lista) => lista.filter(v => !VERBOS_FUERA_DE_PRACTICA.includes(v));

  /* Ni la FORMA ni la PERSONA llegan de golpe: Básico I enseña el presente
     simple (+) y (−) con I/you/we/they en la 5A, las preguntas en la 5B y
     he/she/it en la 6A. La práctica sorteaba la forma entre las tres, así que
     en la 5A podía pedir «Does she work?»: justo las dos cosas que le faltan.
     Es la misma mecánica de `unidadBe`, movida al eje de la forma y al de la
     persona. Con `be` no aplica: para su unidad ya está completo. */
  const etapaPendiente = (tense, campo) => !!tense && tense[campo] != null
    && esCursoActual(tense) && !soloBe(tense)
    && unidadIndice(tense[campo]) > unidadTope;
  const modosPara = (tense) => etapaPendiente(tense, 'unidadInterrogativa')
    ? ['affirmative', 'negative']
    : ['affirmative', 'negative', 'interrogative'];

  /* El complemento lo manda el VERBO. Un transitivo sin objeto no queda raro,
     queda agramatical («He created at school»), y eso era lo único que impedía
     usar más que los verbos del libro. Detrás del objeto solo van adverbiales
     de TIEMPO: «visited the museum at home» se contradice. */
  const complementoPara = (verbo) => {
    const fijo = COMPLEMENTO_DE_VERBO[verbo];
    if (!fijo) return alAzar(COMPLEMENTOS_ADVERBIALES);
    /* Si el complemento fijo YA es una frase preposicional (el caso de `live`,
       que pide lugar), no se le encadena otra: «lived in Santiago on weekends»
       no dice nada. Detrás de un objeto sí, y solo de tiempo. */
    if (/^(in|at|on|with|to|for) /.test(fijo)) return fijo;
    return Math.random() < 0.5 ? fijo : `${fijo} ${alAzar(COMPLEMENTOS_TIEMPO)}`;
  };

  /* Con un tiempo visto SOLO en su etapa de `be`, no vale cualquier verbo:
     preguntar «I ____ (work) every day» a alguien de Básico I unidad 2 es
     preguntarle por la 5A. Y el complemento tampoco vale tal cual — «I am
     every day» no existe. Cada actividad llama a esto con el tiempo que le
     tocó, porque hasta entonces no se sabe cuál es. */
  const paraTiempo = (tense) => {
    /* La tercera persona del singular es la 6A: hasta entonces el sujeto sale
       sin `he`/`she`, o la respuesta correcta sería la -s que aún no ha visto.
       Con `be` no aplica: para la 2B el verbo está completo en todas ellas. */
    const sujetos = etapaPendiente(tense, 'unidadTerceraPersona')
      ? subjects.filter(s => !['He', 'She', 'It'].includes(s))
      : subjects;
    if (soloBe(tense)) return { subj: alAzar(sujetos), v: 'be', comp: alAzar(COMPLEMENTOS_BE) };
    const pool = armables(conIrregulares(tense)
      ? [...regularesDelCurso, ...irregularesDelCurso]
      : regularesDelCurso);
    const v = alAzar(pool);
    return { subj: alAzar(sujetos), v, comp: complementoPara(v) };
  };

  // FASE 2: Generar pregunta de práctica
  const generatePracticeQuestion = (type) => {
    /* La práctica se acota a lo VISTO, no a todo el curso. El constructor no:
       ahí el alumno explora a propósito y puede armar lo que quiera. La
       diferencia es que la práctica corrige y puntúa, y no se puede evaluar a
       nadie sobre algo que no se ha enseñado. */
    const availableTenses = tenses.filter(yaVisto);
    /* TEMA: acota de qué contenido sale la PREGUNTA, no el resto del ejercicio.
       Los distractores de «Identificar» siguen saliendo de todo lo visto: con un
       solo tiempo en la lista el ejercicio sería trivial y no enseñaría a
       distinguir, que es justo lo que evalúa.
       La mezcla sigue siendo lo normal; esto es opcional, para cuando se quiere
       machacar un contenido concreto. */
    const poolTema = practiceTema
      ? availableTenses.filter(t => t.id === practiceTema)
      : availableTenses;
    const delTema = (lista) => {
      const acotada = practiceTema ? lista.filter(t => t.id === practiceTema) : lista;
      return acotada.length ? acotada : lista;
    };
    if (type === 'fill') {
      const tense = poolTema[Math.floor(Math.random() * poolTema.length)];
      const { subj, v, comp } = paraTiempo(tense);
      const mode = Math.random() > 0.4 ? 'affirmative' : 'negative';
      const correctAnswer = buildVerbPhrase(subj, v, tense.id, null, mode);
      const fullSentence = buildSentenceText({ mode, subject: subj, verb: v, complement: comp, tense: tense.id });
      // Aceptar formas contraídas y no contraídas
      const uncontracted = correctAnswer
        .replace("doesn't", "does not").replace("don't", "do not").replace("didn't", "did not")
        .replace("can't", "cannot").replace("won't", "will not").replace("wouldn't", "would not")
        .replace("shouldn't", "should not").replace("mustn't", "must not").replace("couldn't", "could not")
        .replace("isn't", "is not").replace("aren't", "are not").replace("wasn't", "was not")
        .replace("weren't", "were not").replace("haven't", "have not").replace("hasn't", "has not")
        .replace("hadn't", "had not");
      const contracted = correctAnswer
        .replace("does not", "doesn't").replace("do not", "don't").replace("did not", "didn't")
        .replace("will not", "won't").replace("would not", "wouldn't").replace("should not", "shouldn't")
        .replace("must not", "mustn't").replace("could not", "couldn't").replace("cannot", "can't")
        .replace("is not", "isn't").replace("are not", "aren't").replace("was not", "wasn't")
        .replace("were not", "weren't").replace("have not", "haven't").replace("has not", "hasn't")
        .replace("had not", "hadn't");
      const acceptedAnswers = [correctAnswer.toLowerCase()];
      if (uncontracted !== correctAnswer) acceptedAnswers.push(uncontracted.toLowerCase());
      if (contracted !== correctAnswer) acceptedAnswers.push(contracted.toLowerCase());
      return { type: 'fill', subject: subj, verb: v, complement: comp, tense, mode, correctAnswer, acceptedAnswers, fullSentence };
    }

    if (type === 'correct') {
      const simpleTenses = availableTenses.filter(t =>
        ['simple-present', 'simple-past', 'present-continuous', 'present-perfect', 'past-continuous'].includes(t.id)
      );
      /* Fuera los tiempos vistos SOLO con `be`: esta actividad arma una oración
         mal a propósito, y `buildWrongSentence` no contempla `be` — saldrían
         frases rotas de un modo que no es el error que se quiere enseñar.
         Que una actividad no sirva para un contenido es mejor que forzarla. */
      const usables = delTema(simpleTenses.length > 0 ? simpleTenses : availableTenses).filter(t => !soloBe(t));
      if (!usables.length) return null;
      const tense = usables[Math.floor(Math.random() * usables.length)];
      const mode = alAzar(modosPara(tense));
      const { subj, v, comp } = paraTiempo(tense);
      const { sentence: wrongSentence, wrongPart, correctPart } = buildWrongSentence(subj, v, comp, tense.id, mode);
      const fullSentence = buildSentenceText({ mode, subject: subj, verb: v, complement: comp, tense: tense.id });
      const acceptedAnswers = [correctPart.toLowerCase()];
      const uncontracted = correctPart.replace("doesn't","does not").replace("don't","do not").replace("didn't","did not").replace("hasn't","has not").replace("haven't","have not").replace("won't","will not");
      if (uncontracted !== correctPart) acceptedAnswers.push(uncontracted.toLowerCase());
      return { type: 'correct', subject: subj, verb: v, complement: comp, tense, mode, wrongSentence, wrongPart, correctAnswer: correctPart, acceptedAnswers, fullSentence };
    }

    if (type === 'identify') {
      // Si hay menos de 3 tiempos disponibles, solo pedir modo
      const askTense = availableTenses.length >= 3;
      const askMode = true; // siempre pedir modo
      const optionCount = courseIndex <= 1 ? 3 : courseIndex <= 3 ? 4 : 5;

      /* El tiempo se sortea ANTES que la forma: la forma depende de él, porque
         en la etapa previa a la 5B la interrogativa todavía no está vista. */
      const tense = poolTema[Math.floor(Math.random() * poolTema.length)];
      const mode = alAzar(modosPara(tense));
      const { subj, v, comp } = paraTiempo(tense);
      const fullSentence = buildSentenceText({ mode, subject: subj, verb: v, complement: comp, tense: tense.id });

      // Distractores solo de los tiempos que el estudiante conoce
      const distractors = availableTenses
        .filter(t => t.id !== tense.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, optionCount - 1);
      const tenseOptions = askTense ? [...distractors, tense].sort(() => Math.random() - 0.5) : [];

      return { type: 'identify', subject: subj, verb: v, complement: comp, tense, mode, fullSentence, tenseOptions, askTense, askMode };
    }

    if (type === 'conditional') {
      /* La app da UNA cláusula y el alumno completa la otra. Es la única
         actividad donde escribe la forma CONJUGADA de una condicional, así que
         es el sitio donde de verdad aplica el «acepta `was` y avisa».
         Se pregunta por la condición o por el resultado, al azar: la
         correspondencia entre las dos mitades se aprende en los dos sentidos. */
      const tiposDisponibles = CONDICIONALES_POR_CURSO.filter(yaVisto).map(c => c.tipo);
      if (!tiposDisponibles.length) return null;
      const tipoCond = tiposDisponibles[Math.floor(Math.random() * tiposDisponibles.length)];
      const par = PARES_CONDICIONAL[Math.floor(Math.random() * PARES_CONDICIONAL.length)];
      const parte = Math.random() < 0.5 ? 'condicion' : 'resultado';
      const clausula = parte === 'condicion' ? par.cond : par.res;

      const correctAnswer = conditionalVerbPhrase({ tipo: tipoCond, parte,
        subject: clausula.subject, verb: clausula.verb });
      const fullSentence = buildConditionalText({ tipo: tipoCond, condicion: par.cond, resultado: par.res });
      /* El tiempo para las estadísticas es el de la cláusula `if`: es el que
         identifica al tipo de condicional, y el del resultado (would, would
         have) no es un tiempo de la lista. */
      const tense = tenses.find(t => t.id === CONDICIONALES[tipoCond].ifTense) || availableTenses[0];
      const acceptedAnswers = [correctAnswer.toLowerCase()];
      const sinContraer = correctAnswer.replace("doesn't", 'does not').replace("don't", 'do not')
        .replace("didn't", 'did not').replace("won't", 'will not').replace("wouldn't", 'would not')
        .replace("hadn't", 'had not').replace("weren't", 'were not');
      if (sinContraer !== correctAnswer) acceptedAnswers.push(sinContraer.toLowerCase());

      return { type: 'conditional', tipoCond, parte, cond: par.cond, res: par.res,
               subject: clausula.subject, verb: clausula.verb, complement: clausula.complement,
               tense, mode: 'affirmative', correctAnswer, acceptedAnswers, fullSentence };
    }
  };

  // FASE 2: Iniciar modo práctica
  const startPractice = (type) => {
    setPracticeType(type);
    setPracticeMode(true);
    const question = generatePracticeQuestion(type);
    setPracticeQuestion(question);
    setPracticeAnswer('');
    setPracticeResult(null);
    setIdentifyTenseAnswer('');
    setIdentifyModeAnswer('');
    setShowHint(false);
    setAnswerStreak(0);   // nueva actividad → racha desde cero
    setRonda({ hechos: 0, ok: 0, mejor: 0 });
  };

  // SRS: actualizar datos tras verificar respuesta
  /* `adelantado` = el alumno pidió repasar algo que TODAVÍA NO VENCÍA.
     La regla es ASIMÉTRICA a propósito, y es lo que permite ofrecer el adelanto
     sin falsear el calendario:
       · acertar algo que viste hace un rato NO prueba que lo recuerdes, así que
         no gana intervalo y ni siquiera mueve la fecha (moverla lo RETRASARÍA,
         que es justo lo contrario de lo que queremos);
       · fallarlo SÍ prueba algo, y entonces se reinicia como cualquier fallo.
     El acierto se cuenta igual en las estadísticas: pasó de verdad. */
  const updateSRS = (tenseId, mode, isCorrect, adelantado = false) => {
    if (!tenseId || !mode) return;
    const key = `${tenseId}|${mode}`;
    setSrsData(prev => {
      const existing = prev[key] || { lastPracticed: Date.now(), timesCorrect: 0, timesWrong: 0, interval: 1 };
      const soloCuenta = adelantado && isCorrect;
      const updated = {
        ...existing,
        lastPracticed: soloCuenta ? existing.lastPracticed : Date.now(),
        timesCorrect: isCorrect ? existing.timesCorrect + 1 : existing.timesCorrect,
        timesWrong: isCorrect ? existing.timesWrong : existing.timesWrong + 1,
        interval: soloCuenta ? existing.interval : (isCorrect ? Math.min(existing.interval * 2, 30) : 1),
      };
      return { ...prev, [key]: updated };
    });
  };

  // SRS: obtener estructuras cuyo repaso está pendiente (ordenadas por más atrasado primero)
  const getPendingReviews = () => {
    const now = Date.now();
    return Object.entries(srsData)
      .filter(([, entry]) => entry.lastPracticed + entry.interval * 86400000 <= now)
      .map(([key, entry]) => {
        const [tenseId, mode] = key.split('|');
        return { key, tenseId, mode, ...entry };
      })
      /* Las fichas NO se filtraban por nada. Quedaban de cuando el alumno
         practicaba en otro curso —o más adelante en este— y seguían venciendo:
         el repaso le devolvía contenido que su clase todavía no ha visto, y es
         la actividad que puntúa. También caen las de tiempos que ya no existen
         (`future-perfect` se quitó del currículo y sus fichas siguen ahí). */
      .filter(p => yaVisto(tenses.find(t => t.id === p.tenseId)))
      .sort((a, b) => (a.lastPracticed + a.interval * 86400000) - (b.lastPracticed + b.interval * 86400000));
  };

  /* ── EN QUÉ ESTADO ESTÁ EL REPASO ────────────────────────────────────────
     El botón entraba a ciegas y a veces daba con una puerta cerrada: sin
     fichas, ya repasado hoy, o nada vencido todavía. Y es la PRIMERA actividad
     del menú. La sorpresa no se arregla moviéndolo de sitio, se arregla
     diciendo el estado ANTES de entrar; «al día» así deja de parecer un error y
     pasa a ser lo que es, una recompensa. */
  const fichasVigentes = () => Object.entries(srsData)
    .map(([key, e]) => { const [tenseId, mode] = key.split('|'); return { key, tenseId, mode, ...e }; })
    .filter(p => yaVisto(tenses.find(t => t.id === p.tenseId)));
  /* La más floja: peor porcentaje de acierto, y a igualdad la más antigua. Es
     la que se ofrece cuando el alumno quiere practicar sin tener nada vencido. */
  const masDebil = (fichas) => {
    const conIntentos = fichas.filter(f => (f.timesCorrect + f.timesWrong) > 0);
    if (!conIntentos.length) return null;
    return conIntentos.slice().sort((a, b) => {
      const ra = a.timesWrong / (a.timesCorrect + a.timesWrong);
      const rb = b.timesWrong / (b.timesCorrect + b.timesWrong);
      return rb - ra || a.lastPracticed - b.lastPracticed;
    })[0];
  };
  const estadoRepaso = (() => {
    const pendientes = getPendingReviews();
    if (pendientes.length) return { tipo: 'pendientes', n: pendientes.length };
    const fichas = fichasVigentes();
    if (!fichas.length) return { tipo: 'sinDatos' };
    /* Cuándo vuelve, de verdad: decir «mañana» siempre era mentira la mitad de
       las veces, porque el intervalo llega a treinta días. */
    const prox = Math.min(...fichas.map(f => f.lastPracticed + f.interval * 86400000));
    const dias = Math.max(1, Math.ceil((prox - Date.now()) / 86400000));
    return { tipo: 'alDia', dias, debil: masDebil(fichas) };
  })();
  const textoCuando = (dias) => dias <= 1
    ? (language === 'es' ? 'mañana' : 'tomorrow')
    : (language === 'es' ? `en ${dias} días` : `in ${dias} days`);

  // SRS: generar pregunta tipo fill forzando tenseId y mode específicos
  const generateReviewQuestion = (tenseId, mode) => {
    const tense = tenses.find(t => t.id === tenseId);
    if (!tense) return null;
    /* Mismo pozo que la práctica. Antes tenía diez verbos genéricos propios, así
       que se le escapaban tanto el escalón de irregulares como el objeto del
       verbo: podía pedir «I ____ (read) every day» a alguien de Básico. */
    const { subj, v, comp } = paraTiempo(tense);
    const correctAnswer = buildVerbPhrase(subj, v, tenseId, null, mode);
    const fullSentence = buildSentenceText({ mode, subject: subj, verb: v, complement: comp, tense: tenseId });
    const uncontracted = correctAnswer
      .replace("doesn't", "does not").replace("don't", "do not").replace("didn't", "did not")
      .replace("can't", "cannot").replace("won't", "will not").replace("wouldn't", "would not")
      .replace("shouldn't", "should not").replace("mustn't", "must not").replace("couldn't", "could not")
      .replace("isn't", "is not").replace("aren't", "are not").replace("wasn't", "was not")
      .replace("weren't", "were not").replace("haven't", "have not").replace("hasn't", "has not")
      .replace("hadn't", "had not");
    const contracted = correctAnswer
      .replace("does not", "doesn't").replace("do not", "don't").replace("did not", "didn't")
      .replace("will not", "won't").replace("would not", "wouldn't").replace("should not", "shouldn't")
      .replace("must not", "mustn't").replace("could not", "couldn't").replace("cannot", "can't")
      .replace("is not", "isn't").replace("are not", "aren't").replace("was not", "wasn't")
      .replace("were not", "weren't").replace("have not", "haven't").replace("has not", "hasn't")
      .replace("had not", "hadn't");
    const acceptedAnswers = [correctAnswer.toLowerCase()];
    if (uncontracted !== correctAnswer) acceptedAnswers.push(uncontracted.toLowerCase());
    if (contracted !== correctAnswer) acceptedAnswers.push(contracted.toLowerCase());
    return { type: 'review', subject: subj, verb: v, complement: comp, tense, mode, correctAnswer, acceptedAnswers, fullSentence };
  };

  // SRS: iniciar modo repaso
  /* `nueva` distingue entrar al repaso desde el menú (ronda desde cero) de
     encadenar el ejercicio siguiente dentro de la ronda en curso, que también
     pasa por aquí. */
  const startReview = (nueva = false, adelantar = false) => {
    const pending = getPendingReviews();
    setPracticeType('review');
    if (nueva) { setAnswerStreak(0); setRonda({ hechos: 0, ok: 0, mejor: 0 }); }
    setPracticeAnswer('');
    setPracticeResult(null);
    setIdentifyTenseAnswer('');
    setIdentifyModeAnswer('');
    setShowHint(false);
    /* ADELANTAR: nada ha vencido pero el alumno quiere practicar igual. Se le da
       lo que peor lleva, marcado como adelantado para que `updateSRS` no lo
       espacie por acertarlo. Así el modo sirve todos los días sin que el
       calendario mienta. */
    if (adelantar && !pending.length) {
      const d = masDebil(fichasVigentes());
      if (d) {
        setReviewUpToDate(false);
        const q = generateReviewQuestion(d.tenseId, d.mode);
        setPracticeQuestion(q && { ...q, adelantado: true });
        return;
      }
    }
    const hasPracticed = fichasVigentes().length > 0;
    if (pending.length === 0 && hasPracticed) {
      // Hay datos pero ninguno está vencido → genuinamente al día
      setReviewUpToDate(true);
      setPracticeQuestion(null);
    } else if (pending.length === 0 && !hasPracticed) {
      /* Sin fichas: se improvisa una para arrancar. `yaVisto` y NO la
         comparación de curso que había antes, que se saltaba la unidad: en
         Intermedio II semana 1 podía salir Pasado Perfecto, que es la 12A.
         Si en esa unidad todavía no se ha visto nada, no se inventa nada. */
      const available = tenses.filter(yaVisto);
      if (!available.length) { setReviewUpToDate(true); setPracticeQuestion(null); return; }
      const randomTense = available[Math.floor(Math.random() * available.length)];
      setReviewUpToDate(false);
      setPracticeQuestion(generateReviewQuestion(
        randomTense.id,
        ['affirmative', 'negative'][Math.floor(Math.random() * 2)]
      ));
    } else {
      setReviewUpToDate(false);
      setPracticeQuestion(generateReviewQuestion(pending[0].tenseId, pending[0].mode));
    }
  };

  // FASE 2: Verificar respuesta de práctica
  // Gamificación de suite: registra un intento en gh_progress + toasts de logro
  // Cada toast lleva su id y su propio temporizador (3.8s = duración de la
  // animación de ciclo de vida entra→mantiene→sale), así el timing calza aunque
  // se apilen varios.
  const pushBadgeToasts = (keys) => {
    const items = keys.map(k => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, key: k }));
    setBadgeToasts(prev => [...prev, ...items]);
    items.forEach(it => setTimeout(() => setBadgeToasts(prev => prev.filter(x => x.id !== it.id)), 3800));
  };
  /* `racha` = la que quedará TRAS esta respuesta. Se pasa porque sin ella la
     insignia 🎯 «Puntería · 5 aciertos seguidos» era INALCANZABLE en Grammaster:
     se evalúa contra `bestAnswerStreak` del progreso compartido y esta app
     nunca lo enviaba, así que podías encadenar cincuenta y no contaba. La
     insignia no lleva marca de app, o sea que se presentaba como de toda la
     suite siendo solo de Question Lab.
     Se calcula aquí y no se lee del estado por lo mismo que en `sumaRonda`:
     `setAnswerStreak` es asíncrono y leerlo daría el de la respuesta anterior. */
  const recordGameAttempt = (tenseId, isCorrect, racha) => {
    try {
      const p = loadProgress(window.localStorage);
      recordAttempt(p, { app: 'grammaster', tenseId, correct: !!isCorrect, answerStreak: racha });
      const { newly } = evaluateBadges(p, BADGES, tenseId ? [tenseId] : []);
      saveProgress(window.localStorage, p);
      if (newly.length) pushBadgeToasts(newly);
    } catch (e) {}
  };

  /* Cierre de ronda → progreso compartido. Va en un efecto y no dentro de
     sumaRonda porque ahí estaríamos con un side effect adentro de un updater de
     estado, que React puede ejecutar dos veces. El efecto depende de
     `ronda.hechos`, así que dispara UNA vez, justo cuando llega al total. */
  useEffect(() => {
    if (ronda.hechos !== RONDA) return;
    try {
      const p = loadProgress(window.localStorage);
      recordRound(p, { app: 'grammaster', ok: ronda.ok, total: RONDA });
      const { newly } = evaluateBadges(p, BADGES, []);
      saveProgress(window.localStorage, p);
      if (newly.length) pushBadgeToasts(newly);
    } catch (e) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ronda.hechos]);

  /* La racha se lee del valor que TENDRÁ tras este acierto: setAnswerStreak es
     asíncrono, así que leer answerStreak aquí daría el de la respuesta anterior. */
  const sumaRonda = (acerto) => setRonda(r => ({
    hechos: r.hechos + 1,
    ok: r.ok + (acerto ? 1 : 0),
    mejor: Math.max(r.mejor, acerto ? answerStreak + 1 : 0),
  }));

  const checkPracticeAnswer = () => {
    if (!practiceQuestion) return;
    recordPracticeDay();
    if (practiceQuestion.type === 'identify') {
      const tenseOk = !practiceQuestion.askTense || identifyTenseAnswer === practiceQuestion.tense.id;
      const modeOk = identifyModeAnswer === practiceQuestion.mode;
      const isCorrect = tenseOk && modeOk;
      recordGameAttempt(practiceQuestion.tense?.id, isCorrect, isCorrect ? answerStreak + 1 : 0);
      setAnswerStreak(s => isCorrect ? s + 1 : 0);
      sumaRonda(isCorrect);
      setPracticeResult({
        correct: isCorrect,
        tenseOk,
        modeOk,
        correctTense: language === 'es' ? practiceQuestion.tense.nameEs : practiceQuestion.tense.nameEn,
        correctMode: practiceQuestion.mode,
        fullSentence: practiceQuestion.fullSentence,
      });
      return;
    }
    const userAns = practiceAnswer.toLowerCase().trim().replace(/\.$/, '');
    const accepted = practiceQuestion.acceptedAnswers || [practiceQuestion.correctAnswer.toLowerCase()];
    /* «If I WAS rich» en vez de «If I WERE rich»: la forma coloquial existe y el
       alumno la va a escribir. Cuenta como ACIERTO y se avisa aparte — marcarla
       mal enseñaría que está prohibida, y no lo está. Es la decisión tomada para
       toda la suite, y esta actividad es el único sitio donde se puede aplicar:
       es la única donde el alumno escribe la forma conjugada de una condicional. */
    const avisoWas = practiceQuestion.type === 'conditional' && esWasPorWere({
      tipo: practiceQuestion.tipoCond, parte: practiceQuestion.parte,
      verb: practiceQuestion.verb, respuesta: userAns });
    const isCorrect = avisoWas || accepted.some(a => a.replace(/\.$/, '') === userAns);
    updateSRS(practiceQuestion.tense?.id, practiceQuestion.mode, isCorrect, practiceQuestion.adelantado);
    recordGameAttempt(practiceQuestion.tense?.id, isCorrect, isCorrect ? answerStreak + 1 : 0);
    setAnswerStreak(s => isCorrect ? s + 1 : 0);
    sumaRonda(isCorrect);

    let hint = null;
    if (!isCorrect) {
      const tenseId = practiceQuestion.tense?.id;
      const mode = practiceQuestion.mode;
      const subj = practiceQuestion.subject?.toLowerCase();
      const verb = practiceQuestion.verb?.toLowerCase();
      const is3p = ['he', 'she', 'it'].includes(subj);

      const hasAuxBe    = /\b(am|is|are)\b/.test(userAns);
      const hasWaWere   = /\b(was|were)\b/.test(userAns);
      const hasWill     = /\bwill\b/.test(userAns);
      const hasHaveHas  = /\b(have|has)\b/.test(userAns);
      const hasHad      = /\bhad\b/.test(userAns);
      const hasBeen     = /\bbeen\b/.test(userAns);
      const hasWould    = /\bwould\b/.test(userAns);
      const hasIngForm  = /\b\w+ing\b/.test(userAns);
      const hasGoingTo  = /going\s+to/.test(userAns);
      const hasUsedTo   = /used\s+to/.test(userAns);
      const hasNegAux   = /\b(don't|doesn't|didn't|won't|isn't|aren't|wasn't|weren't|haven't|hasn't|hadn't|wouldn't|couldn't|shouldn't|mustn't|cannot|can't|not)\b/.test(userAns);
      const isBaseForm  = userAns === verb;

      const h = (es, en) => language === 'es' ? es : en;

      if (tenseId === 'simple-present') {
        if (mode === 'affirmative' && hasAuxBe && hasIngForm)
          hint = h('Para hábitos y rutinas se usa el Present Simple, no el Continuous.',
                   'For habits and routines, use Present Simple, not Continuous.');
        else if (mode === 'affirmative' && is3p && !/\w+(s|es|ies)\b/.test(userAns))
          hint = h('Recuerda agregar -s/-es al verbo con he/she/it en Present Simple.',
                   'Remember to add -s/-es to the verb with he/she/it in Present Simple.');
        else if (mode === 'negative' && !hasNegAux)
          hint = h("Negativo: usa don't / doesn't + verbo base. Ejemplo: She doesn't work.",
                   "Negative: use don't / doesn't + base verb. Example: She doesn't work.");
      }

      else if (tenseId === 'present-continuous') {
        if (mode === 'affirmative' && hasIngForm && !hasAuxBe)
          hint = h('Falta el auxiliar be (am/is/are). Estructura: am/is/are + verbo-ing.',
                   'Missing auxiliary be (am/is/are). Structure: am/is/are + verb-ing.');
        else if (mode === 'affirmative' && !hasIngForm)
          hint = h('El Present Continuous necesita verbo-ing. Ejemplo: is working.',
                   'Present Continuous needs verb-ing. Example: is working.');
        else if (mode === 'negative' && !hasNegAux)
          hint = h("Negativo: am/is/are + not + verbo-ing. Ejemplo: She isn't working.",
                   "Negative: am/is/are + not + verb-ing. Example: She isn't working.");
      }

      else if (tenseId === 'simple-past') {
        if (isBaseForm)
          hint = h('El Past Simple necesita la forma pasada (-ed para regulares, o forma irregular).',
                   'Past Simple needs the past form (-ed for regular verbs, or the irregular form).');
        else if (/\bdid\b/.test(userAns) && !isBaseForm)
          hint = h("Con 'did' el verbo va en forma base: did + work (no 'did worked').",
                   "With 'did' the verb stays in base form: did + work (not 'did worked').");
        else if (mode === 'negative' && !hasNegAux)
          hint = h("Negativo: didn't + verbo base. Ejemplo: She didn't work.",
                   "Negative: didn't + base verb. Example: She didn't work.");
      }

      else if (tenseId === 'future-going-to') {
        if (hasWill && !hasGoingTo)
          hint = h("'Going to' expresa planes e intenciones, no uses 'will' aquí. Estructura: am/is/are going to + verbo.",
                   "'Going to' expresses plans and intentions. Structure: am/is/are going to + verb.");
        else if (hasGoingTo && !hasAuxBe)
          hint = h("Falta el auxiliar be antes de 'going to'. Ejemplo: She is going to work.",
                   "Missing auxiliary be before 'going to'. Example: She is going to work.");
        else if (mode === 'negative' && !hasNegAux)
          hint = h("Negativo: am/is/are + not going to + verbo. Ejemplo: She isn't going to work.",
                   "Negative: am/is/are + not going to + verb. Example: She isn't going to work.");
      }

      else if (tenseId === 'present-perfect') {
        if (!hasHaveHas && !hasHad)
          hint = h("El Present Perfect necesita have/has + participio pasado. Ejemplo: She has worked.",
                   "Present Perfect needs have/has + past participle. Example: She has worked.");
        else if (hasHad && !hasHaveHas)
          hint = h("Para Present Perfect usa have/has, no 'had' (eso es Past Perfect). Ejemplo: She has worked.",
                   "For Present Perfect use have/has, not 'had' (that's Past Perfect). Example: She has worked.");
        else if (mode === 'negative' && !hasNegAux)
          hint = h("Negativo: have/has + not + participio. Ejemplo: She hasn't worked.",
                   "Negative: have/has + not + past participle. Example: She hasn't worked.");
      }

      else if (tenseId === 'past-continuous') {
        if (hasIngForm && !hasWaWere)
          hint = h("Falta el auxiliar was/were. Estructura: was/were + verbo-ing.",
                   "Missing was/were. Structure: was/were + verb-ing.");
        else if (!hasIngForm)
          hint = h("El Past Continuous necesita was/were + verbo-ing. Ejemplo: She was working.",
                   "Past Continuous needs was/were + verb-ing. Example: She was working.");
        else if (mode === 'negative' && !hasNegAux)
          hint = h("Negativo: was/were + not + verbo-ing. Ejemplo: She wasn't working.",
                   "Negative: was/were + not + verb-ing. Example: She wasn't working.");
      }

      else if (tenseId === 'simple-future') {
        if (!hasWill && hasGoingTo)
          hint = h("'Will' expresa predicciones y decisiones espontáneas. Estructura: will + verbo base.",
                   "'Will' expresses predictions and spontaneous decisions. Structure: will + base verb.");
        else if (!hasWill)
          hint = h("El Simple Future necesita 'will' + verbo base. Ejemplo: She will work.",
                   "Simple Future needs 'will' + base verb. Example: She will work.");
        else if (hasWill && /will\s+\w+(s|es)\b/.test(userAns))
          hint = h("Después de 'will' el verbo siempre va en forma base, sin -s. Ejemplo: will work (no 'will works').",
                   "After 'will' the verb is always in base form, no -s. Example: will work (not 'will works').");
        else if (mode === 'negative' && !hasNegAux)
          hint = h("Negativo: won't + verbo base. Ejemplo: She won't work.",
                   "Negative: won't + base verb. Example: She won't work.");
      }

      else if (tenseId === 'past-perfect') {
        if (hasHaveHas && !hasHad)
          hint = h("Para Past Perfect usa 'had' (no have/has). Ambas personas usan 'had'. Ejemplo: She had worked.",
                   "For Past Perfect use 'had' (not have/has). All persons use 'had'. Example: She had worked.");
        else if (!hasHad)
          hint = h("El Past Perfect necesita 'had' + participio pasado. Ejemplo: She had worked.",
                   "Past Perfect needs 'had' + past participle. Example: She had worked.");
        else if (mode === 'negative' && !hasNegAux)
          hint = h("Negativo: had + not + participio. Ejemplo: She hadn't worked.",
                   "Negative: had + not + past participle. Example: She hadn't worked.");
      }

      else if (tenseId === 'used-to') {
        if (/\buse\s+to\b/.test(userAns) && !hasUsedTo)
          hint = h("Es 'used to', no 'use to'. La forma siempre lleva -d. Ejemplo: She used to work.",
                   "It's 'used to', not 'use to'. Always with -d. Example: She used to work.");
        else if (!hasUsedTo)
          hint = h("'Used to' expresa hábitos del pasado. Estructura: used to + verbo base. Ejemplo: She used to work.",
                   "'Used to' expresses past habits. Structure: used to + base verb. Example: She used to work.");
        else if (mode === 'negative' && !hasNegAux)
          hint = h("Negativo: didn't use to + verbo base. Ejemplo: She didn't use to work.",
                   "Negative: didn't use to + base verb. Example: She didn't use to work.");
      }

      else if (tenseId === 'present-perfect-continuous') {
        if (hasAuxBe && hasIngForm && !hasHaveHas)
          hint = h("Eso es Present Continuous. El Presente Perfecto Continuo necesita have/has + been + verbo-ing.",
                   "That's Present Continuous. Present Perfect Continuous needs have/has + been + verb-ing.");
        else if (hasHaveHas && !hasBeen)
          hint = h("Falta 'been'. Estructura completa: have/has + been + verbo-ing. Ejemplo: She has been working.",
                   "Missing 'been'. Full structure: have/has + been + verb-ing. Example: She has been working.");
        else if (!hasHaveHas)
          hint = h("El Presente Perfecto Continuo necesita have/has + been + verbo-ing. Ejemplo: She has been working.",
                   "Present Perfect Continuous needs have/has + been + verb-ing. Example: She has been working.");
      }

      // Fallback: negativo sin auxiliar (para tiempos no cubiertos arriba)
      if (!hint && mode === 'negative' && !hasNegAux)
        hint = h("Las oraciones negativas necesitan un auxiliar negativo (don't, didn't, won't, isn't, hadn't…).",
                 "Negative sentences need a negative auxiliary (don't, didn't, won't, isn't, hadn't…).");
    }

    setPracticeResult({
      correct: isCorrect,
      userAnswer: practiceAnswer,
      correctAnswer: practiceQuestion.correctAnswer,
      fullSentence: practiceQuestion.fullSentence,
      hint,
      /* Aviso, no corrección: la respuesta cuenta como buena y además se explica
         por qué la forma de manual es otra. */
      avisoWas,
    });
  };

  // Análisis visual de la oración. El ORDEN de las partes debe coincidir siempre
  // con el texto de buildSentenceText: ambos derivan del mismo motor (conjugation.js).
  const generateSentenceAnalysis = (config) => {
    let { subjectText, verbText, complementText, auxiliary, verbForm, tenseId, mode, modalId, whWordText, adverbText } = config;
    // El sujeto conserva nombres propios ("Maria") y normaliza "i" → "I";
    // el verbo siempre va en minúscula a mitad de oración.
    subjectText = smartCaseSubject(subjectText);
    verbText = verbText.toLowerCase().trim();
    if (complementText) complementText = complementText.trim();
    verbForm = verbForm ? verbForm.toLowerCase() : verbForm;
    const currentTense = tenses.find(t => t.id === tenseId);
    const currentModal = modalId ? modals.find(m => m.id === modalId) : null;
    const parts = [];
    const isInterrogative = mode === 'interrogative';


    const isIrregularVerb = irregularVerbs[verbText.toLowerCase()] !== undefined;
    const verbChangeType = getVerbChangeType(verbForm, verbText, tenseId);

    // Preparar las partes individuales
    const subjectPart = {
      text: isInterrogative ? subjectText : subjectText.charAt(0).toUpperCase() + subjectText.slice(1),
      type: 'subject',
      color: 'blue',
      explanation: language === 'es' ? SENTENCE_PART_EXPLANATIONS.subject.es : SENTENCE_PART_EXPLANATIONS.subject.en,
      original: subjectText,
      changed: false
    };

    // Unidades del auxiliar: "going to" / "used to" / "use to" se explican como bloque
    const auxUnits = [];
    if (auxiliary) {
      const words = auxiliary.split(' ');
      for (let i = 0; i < words.length; i++) {
        const pair = words[i + 1] ? words[i] + ' ' + words[i + 1] : null;
        if (pair && ['going to', 'used to', 'use to'].includes(pair)) {
          auxUnits.push(pair);
          i++;
        } else {
          auxUnits.push(words[i]);
        }
      }
    }
    const makeAuxPart = (aux, capitalize) => {
      const auxExplanation = SENTENCE_PART_EXPLANATIONS.auxiliary[aux.toLowerCase()];
      return {
        text: capitalize ? aux.charAt(0).toUpperCase() + aux.slice(1) : aux,
        type: 'auxiliary',
        color: 'purple',
        explanation: auxExplanation ? (language === 'es' ? auxExplanation.es : auxExplanation.en) : (language === 'es' ? 'Auxiliar verbal' : 'Verbal auxiliary'),
        original: null,
        changed: true,
        isNew: true
      };
    };

    const verbExplanation = SENTENCE_PART_EXPLANATIONS.verbChanges[verbChangeType];
    let verbDetailedExplanation = language === 'es' ? verbExplanation.es : verbExplanation.en;

    if (isIrregularVerb && (verbChangeType === 'irregular' || verbChangeType === 'past')) {
      const irrForms = irregularVerbs[verbText.toLowerCase()];
      verbDetailedExplanation += language === 'es'
        ? ` (${verbText} → ${irrForms.past} → ${irrForms.participle})`
        : ` (${verbText} → ${irrForms.past} → ${irrForms.participle})`;
    }

    const verbPart = {
      text: verbForm,
      type: 'verb',
      color: 'green',
      explanation: verbDetailedExplanation,
      original: verbText,
      changed: verbForm !== verbText,
      transformation: verbForm !== verbText ? `${verbText} → ${verbForm}` : null
    };

    // Detectar si el complemento es un adverbial (tiempo/lugar/modo)
    const ADVERBIAL_STARTERS = ['at ', 'in ', 'on ', 'before ', 'after ', 'since ', 'for ', 'during ', 'by ', 'to ', 'from ', 'near ', 'behind ', 'through ', 'between ', 'under ', 'over ', 'along ', 'across ', 'around ', 'outside ', 'inside ', 'yesterday', 'today', 'tomorrow', 'every ', 'last ', 'next ', 'ago', 'this '];
    const isAdverbialText = (text) => {
      if (!text) return false;
      const lower = text.toLowerCase().trim();
      return ADVERBIAL_STARTERS.some(s => lower.startsWith(s) || lower === s.trim());
    };

    const isIntermediateOrAbove = COURSE_ORDER.indexOf(cefrLevel) >= COURSE_ORDER.indexOf('intermedio1');
    const complementIsAdverbial = isIntermediateOrAbove && isAdverbialText(complementText);
    const complementPart = complementText ? {
      text: complementText,
      type: complementIsAdverbial ? 'adverbial' : 'complement',
      color: complementIsAdverbial ? 'amber' : 'emerald',
      explanation: complementIsAdverbial
        ? (language === 'es' ? 'Adverbial: indica cuándo, dónde o cómo ocurre la acción' : 'Adverbial: indicates when, where, or how the action occurs')
        : (language === 'es' ? 'Complemento: objeto directo o atributo del sujeto' : 'Complement: direct object or subject attribute'),
      original: complementText,
      changed: false
    } : null;

    // Parte del adverbio de frecuencia
    const adverbPart = adverbText ? {
      text: adverbText,
      type: 'adverb',
      color: 'cyan',
      explanation: language === 'es'
        ? 'Adverbio de frecuencia - indica con qué frecuencia ocurre la acción'
        : 'Frequency adverb - indicates how often the action occurs',
      original: adverbText,
      changed: false
    } : null;

    // Para "to be" como verbo principal (sin modal), el be form ya es el verbo — no hay verbPart separado
    const isBeMainVerb = verbText.toLowerCase() === 'be' && !modalId &&
      (tenseId === 'simple-present' || tenseId === 'simple-past');

    const showAdverb = !!adverbPart;

    // Construir partes según el modo
    if (mode === 'subject-question') {
      /* La wh ocupa la casilla del sujeto, así que el orden es el de una
         afirmación y no hay inversión. Se pinta como UNA pieza en el lugar
         donde iría el sujeto: verla ahí es lo que enseña la estructura. */
      const whTxt = whWordText || 'who';
      parts.push({
        text: whTxt.charAt(0).toUpperCase() + whTxt.slice(1),
        type: 'wh-subject',
        color: 'teal',
        explanation: language === 'es'
          ? 'La palabra WH es el SUJETO de la pregunta: por eso no hay auxiliar prestado ni inversión, el orden es el mismo de una afirmación.'
          : 'The WH word is the SUBJECT of the question: that is why there is no borrowed auxiliary and no inversion: the order is the same as a statement.',
        original: whTxt,
        changed: false
      });
      if (showAdverb && auxUnits.length === 0) parts.push(adverbPart);
      auxUnits.forEach(aux => parts.push(makeAuxPart(aux, false)));
      if (showAdverb && auxUnits.length > 0) parts.push(adverbPart);
      if (!isBeMainVerb) parts.push(verbPart);
      if (complementPart) parts.push(complementPart);
      parts.push({
        text: '?', type: 'punctuation', color: 'gray',
        explanation: language === 'es' ? 'Signo de interrogación' : 'Question mark',
        original: '?', changed: false
      });
    } else if (isInterrogative) {
      // Orden interrogativo: [WH] + PRIMER auxiliar + Sujeto + [Adverbio] + resto
      // del auxiliar + Verbo + Complemento + ?  →  "Will she have worked?"
      if (whWordText) {
        parts.push({
          text: whWordText.charAt(0).toUpperCase() + whWordText.slice(1),
          type: 'wh-word',
          color: 'pink',
          explanation: language === 'es'
            ? `Palabra interrogativa WH - indica qué información se busca`
            : `WH question word - indicates what information is being sought`,
          original: whWordText,
          changed: false
        });
      }
      const [firstAux, ...restAux] = auxUnits;
      if (firstAux) parts.push(makeAuxPart(firstAux, !whWordText));
      parts.push(subjectPart);
      if (showAdverb) parts.push(adverbPart);
      restAux.forEach(aux => parts.push(makeAuxPart(aux, false)));
      if (!isBeMainVerb) parts.push(verbPart);
      if (complementPart) parts.push(complementPart);
      parts.push({
        text: '?',
        type: 'punctuation',
        color: 'gray',
        explanation: language === 'es' ? 'Signo de interrogación' : 'Question mark',
        original: '?',
        changed: false
      });
    } else {
      // Orden normal: Sujeto + [Adverbio si no hay auxiliar] + Auxiliar + [Adverbio si hay auxiliar] + Verbo + Complemento + .
      parts.push(subjectPart);
      if (showAdverb && auxUnits.length === 0) {
        // Sin auxiliar: Sujeto + Adverbio + Verbo
        parts.push(adverbPart);
      }
      auxUnits.forEach(aux => parts.push(makeAuxPart(aux, false)));
      if (showAdverb && auxUnits.length > 0) {
        // Con auxiliar: Sujeto + Auxiliar + Adverbio + Verbo
        parts.push(adverbPart);
      }
      if (!isBeMainVerb) parts.push(verbPart);
      if (complementPart) parts.push(complementPart);
      parts.push({
        text: '.',
        type: 'punctuation',
        color: 'gray',
        explanation: language === 'es' ? 'Punto final' : 'Period',
        original: '.',
        changed: false
      });
    }

    // Generar resumen de la estructura
    const tenseName = language === 'es' ? currentTense?.nameEs : currentTense?.nameEn;
    const modeNames = {
      affirmative: language === 'es' ? 'afirmativa' : 'affirmative',
      negative: language === 'es' ? 'negativa' : 'negative',
      interrogative: language === 'es' ? 'interrogativa' : 'interrogative'
    };

    // Determinar la estructura visual
    let structureText;
    if (currentModal) {
      structureText = language === 'es'
        ? `Estructura con modal: Sujeto + ${currentModal.name} + Verbo (forma base)${complementText ? ' + Complemento' : ''}`
        : `Structure with modal: Subject + ${currentModal.name} + Verb (base form)${complementText ? ' + Complement' : ''}`;
    } else {
      structureText = language === 'es'
        ? `Estructura: ${mode === 'interrogative' ? (auxiliary ? auxiliary.split(' ')[0].toUpperCase() : 'Aux') + ' + Sujeto' : 'Sujeto'} + ${auxiliary ? 'Auxiliar + ' : ''}Verbo${complementText ? ' + Complemento' : ''}`
        : `Structure: ${mode === 'interrogative' ? (auxiliary ? auxiliary.split(' ')[0].toUpperCase() : 'Aux') + ' + Subject' : 'Subject'} + ${auxiliary ? 'Auxiliary + ' : ''}Verb${complementText ? ' + Complement' : ''}`;
    }

    // Determinar la regla aplicada
    let ruleText;
    if (currentModal) {
      ruleText = language === 'es'
        ? currentModal.fullDescEs
        : currentModal.fullDescEn;
    } else {
      ruleText = currentTense ? (language === 'es' ? currentTense.descEs : currentTense.descEn) : '';
    }

    const summary = {
      tense: currentModal ? `${currentModal.name} (${language === 'es' ? currentModal.descEs : currentModal.descEn})` : tenseName,
      mode: modeNames[mode],
      structure: structureText,
      rule: ruleText,
      isModal: !!currentModal,
      modalInfo: currentModal ? {
        name: currentModal.name,
        timeContext: currentModal.timeContext,
        desc: language === 'es' ? currentModal.fullDescEs : currentModal.fullDescEn
      } : null
    };

    return { parts, summary };
  };

  const validateWhExtension = (extension) => {
    if (!extension) return '';

    const lowerExt = extension.toLowerCase().trim();
    const words = lowerExt.split(' ').map(w => w.replace(/[,.!?]/g, ''));

    const hasManyWord = words.includes('many');
    const hasMuchWord = words.includes('much');

    if (hasManyWord) {
      const uncountable = words.find(w => uncountableNouns.includes(w));
      if (uncountable) return 'Warning: "' + uncountable + '" is uncountable. Try "How much" instead.';
    }

    if (hasMuchWord) {
      const countable = words.find(w => countableNouns.includes(w));
      if (countable) return 'Warning: "' + countable + '" is countable/plural. Try "How many" instead.';
    }

    return '';
  };

  const checkSemanticCoherence = (complementText, tenseId) => {
    if (!complementText || !tenseId) {
      setSemanticWarning(null);
      return;
    }

    const lowerComp = complementText.toLowerCase();
    const currentTense = tenses.find(t => t.id === tenseId);
    if (!currentTense) return;

    /* La detección y la compatibilidad viven en `grammar.js`, con sus pruebas:
       aquí solo se pintan. */
    const encontrado = detectarMarcador(lowerComp);
    if (!encontrado) {
      setSemanticWarning(null);
      return;
    }
    const detectedMarker = encontrado.texto;
    const detectedType = encontrado.tipo;

    if (!marcadorCuadra(currentTense, detectedType)) {
      const suggestedTense = tenses.find(t => t.timeType === detectedType && t.id.includes('simple'));
      
      // Recolectar todos los marcadores del timeType actual
      const allCurrentMarkers = [];
      for (const [category, markers] of Object.entries(timeMarkers[currentTense.timeType])) {
        allCurrentMarkers.push(...markers.map(m => m.text));
      }
      
      setSemanticWarning({
        type: 'warning',
        marker: detectedMarker,
        markerType: detectedType,
        currentTense: language === 'es' ? currentTense.nameEs : currentTense.nameEn,
        suggestedTense: suggestedTense ? (language === 'es' ? suggestedTense.nameEs : suggestedTense.nameEn) : null,
        suggestedTenseId: suggestedTense ? suggestedTense.id : null,
        suggestedMarkers: allCurrentMarkers
      });
    } else {
      setSemanticWarning({
        type: 'success',
        marker: detectedMarker,
        currentTense: language === 'es' ? currentTense.nameEs : currentTense.nameEn
      });
    }
  };

  // Los "fixes" solo cambian el estado: la regeneración en vivo se encarga
  // de actualizar la oración mostrada (ver efecto junto a generateSentence)
  const applyTimeMarkerFix = () => {
    if (semanticWarning && semanticWarning.suggestedMarkers && semanticWarning.suggestedMarkers.length > 0) {
      setComplement(semanticWarning.suggestedMarkers[0]);
    }
  };

  const applyTenseFix = () => {
    if (semanticWarning && semanticWarning.suggestedTenseId) {
      setSelectedTense(semanticWarning.suggestedTenseId);
    }
  };

  // NUEVA FUNCIÓN: Aplicar marcador temporal al hacer click
  useEffect(() => {
    const warning = validateWhExtension(whExtension);
    setWhWarning(warning);
    checkSemanticCoherence(complement, selectedTense);
  }, [whExtension, complement, selectedTense, language]);

  useEffect(() => {
    const lowerVerb = verb.toLowerCase();
    setIsIrregular(!!irregularVerbs[lowerVerb]);
  }, [verb]);

  /* Cualquier cambio en el verbo desarma la confirmación: si lo corrigió, el
     aviso ya no toca; y si sigue dudoso, que lo vuelva a leer. */
  useEffect(() => { setConfirmVerbo(false); }, [verb, condVerb]);

  // La parte seleccionada/enfocada de la oración pierde sentido si se regenera
  useEffect(() => {
    setSelectedPartIndex(null);
  }, [sentenceAnalysis]);

  // Validación de entradas en tiempo real
  useEffect(() => {
    const timer = setTimeout(() => {
      if (subject.trim()) {
        setSubjectValidation(validateSubject(subject, language));
      } else {
        setSubjectValidation({ valid: true, warning: null });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [subject, language]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (verb.trim()) {
        setVerbValidation(validateVerb(verb, language));
        setVerbBaseSuggestion(detectConjugatedVerbBase(verb));
      } else {
        setVerbValidation({ valid: true, warning: null });
        setVerbBaseSuggestion(null);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [verb, language]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (complement.trim()) {
        /* El verbo entra en la validación: sin él no hay forma de ver que a
           «go the park» le falta el «to». Y por eso el efecto depende también
           de `verb`: escribir el verbo DESPUÉS del complemento es lo normal. */
        setComplementValidation(validateComplement(complement, language, verb));
      } else {
        setComplementValidation({ valid: true, warning: null });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [complement, language, verb]);

  // Verificar ortografía en tiempo real
  useEffect(() => {
    const timer = setTimeout(() => {
      checkSpelling(subject, 'subject');
    }, 500);
    return () => clearTimeout(timer);
  }, [subject]);

  useEffect(() => {
    const timer = setTimeout(() => {
      checkSpelling(verb, 'verb');
    }, 500);
    return () => clearTimeout(timer);
  }, [verb]);

  /* Depende TAMBIÉN del verbo: la categoría que pide el hueco del complemento la
     decide el verbo («be» pide adjetivo). Sin `verb` en la lista, quien escribe
     primero el complemento y luego elige «be» se queda con las sugerencias
     calculadas sin categoría hasta que vuelva a tocar el campo. */
  useEffect(() => {
    const timer = setTimeout(() => {
      checkSpelling(complement, 'complement');
    }, 500);
    return () => clearTimeout(timer);
  }, [complement, verb]);


  const resetForm = () => {
    setSubject(''); setVerb(''); setComplement('');
    /* `tipoCond` va aquí porque ahora es un valor MÁS del mismo selector que
       `tense` y `modal`: los tres se limpian juntos o el botón miente. Y las dos
       cláusulas de la condicional tampoco se limpiaban — «Limpiar todo» las
       dejaba escritas. */
    setSelectedTense(''); setSelectedMode('affirmative'); setSelectedModal(''); setTipoCond(null);
    setCondNeg(false); setCondSubject(''); setCondVerb(''); setCondComplement('');
    setWhWord(''); setWhExtension(''); setWhWarning(''); setSelectedAdverb(''); setWhEsSujeto(false);
    setGeneratedSentence(''); setSemanticWarning(null);
    setSentenceAnalysis(null); setShowAnalysisDetails(false);
    setAllModeSentences(null); setShowAllModes(false);
    setSubjectValidation({ valid: true, warning: null });
    setVerbValidation({ valid: true, warning: null });
    setComplementValidation({ valid: true, warning: null });
    setConfirmVerbo(false);
  };

  // Calcula la oración, las 3 variantes de modo y el análisis visual, y los
  // muestra. Sin efectos sobre historial ni estadísticas — eso solo ocurre al
  // pulsar "Generar". Retorna la oración construida.
  const computeSentenceDisplay = () => {
    const adverb = selectedAdverb || '';
    const fullWhWord = whWord && whExtUsable ? whWord + ' ' + whExtUsable : whWord;
    const params = { subject, verb, complement, tense: selectedTense, modal: selectedModal,
      whWord, whExtension: whExtUsable, adverb };

    /* Condicional: son dos cláusulas y el TIPO fija los dos tiempos, así que no
       pasa por el selector de tiempos ni por las 3 variantes de modo — esas
       comparan una misma oración simple en afirmativa/negativa/interrogativa y
       aquí no aplican. */
    if (esCondicional) {
      const cond = { subject: condSubject, verb: condVerb, complement: condComplement };
      const res = { subject, verb, complement };
      const frase = buildConditionalText({ tipo: tipoCond, condicion: cond, resultado: res,
        modo: selectedMode, condicionNegativa: condNeg });
      setGeneratedSentence(frase);
      setAllModeSentences(null);

      /* El análisis SÍ se muestra, y de las dos cláusulas. Apagarlo era el
         error: la app convertía `run` en `ran` sin decir que lo hacía ni cómo
         se llama eso, y así no enseña nada de la cláusula `if`. Las piezas de
         ambas se concatenan con un chip `if` en medio, de modo que el panel de
         siempre las dibuja sin cambios — incluida la marca de «cambió», que es
         la que muestra run → ran. */
      const cfg = CONDICIONALES[tipoCond];
      const modoCond = condNeg ? 'negative' : 'affirmative';
      const aCond = getAuxAndVerbForm(cond.subject, cond.verb, cfg.ifTense, '', modoCond);
      const piezasCond = generateSentenceAnalysis({
        subjectText: cond.subject, verbText: cond.verb, complementText: cond.complement,
        auxiliary: aCond.auxiliary, verbForm: aCond.verbForm,
        tenseId: cfg.ifTense, mode: modoCond, modalId: '',
      }).parts;

      /* La principal no pasa por `getAuxAndVerbForm` en la 3ª: «would have» no
         es un tiempo de la lista, así que el auxiliar y el participio se pasan
         a mano. En la 1ª y la 2ª basta con el modal o el tiempo. */
      const neg = selectedMode === 'negative';
      const auxRes = cfg.main.perfecto
        ? (neg ? "wouldn't have" : 'would have')
        : (cfg.main.modal ? (neg ? "wouldn't" : 'would') : (neg ? "won't" : 'will'));
      const formaRes = cfg.main.perfecto ? pastParticiple(res.verb.toLowerCase().trim()) : res.verb.toLowerCase().trim();
      const piezasRes = generateSentenceAnalysis({
        subjectText: res.subject, verbText: res.verb, complementText: res.complement,
        auxiliary: auxRes, verbForm: formaRes,
        tenseId: cfg.main.perfecto ? '' : (cfg.main.tense || ''), mode: selectedMode,
        modalId: cfg.main.modal || '',
      }).parts;

      /* `generateSentenceAnalysis` está pensado para oraciones SUELTAS: capitaliza
         la primera palabra y cierra con punto. Aquí ninguna de las dos cláusulas
         abre la oración —la condición va tras «If » y el resultado tras la coma—,
         así que hay que deshacer ambas cosas. Se corrige aquí y no en esa
         función porque tiene un test de paridad que la refleja. */
      const bajaPrimera = (piezas) => {
        const i = piezas.findIndex(p => p.type === 'subject' || p.type === 'auxiliary');
        if (i === -1) return piezas;
        const p = piezas[i];
        // Un nombre propio o «I» conservan su mayúscula: smartCase ya lo decidió.
        if (p.type === 'subject') {
          const norm = smartCaseSubject(p.original || p.text);
          if (norm && norm[0] !== norm[0].toLowerCase()) return piezas;
        }
        const copia = piezas.slice();
        copia[i] = { ...p, text: p.text.charAt(0).toLowerCase() + p.text.slice(1) };
        return copia;
      };
      // La condición no termina la oración: cierra con COMA, no con punto.
      const conComa = (piezas) => [
        ...piezas.filter(p => p.type !== 'punctuation'),
        { text: ',', type: 'punctuation', color: 'gray',
          explanation: language === 'es'
            ? 'Separa la condición del resultado. Solo va cuando el «if» abre la oración.'
            : 'Separates the condition from the result. It only appears when the "if" opens the sentence.',
          original: ',', changed: false },
      ];

      const tnCond = tenses.find(x => x.id === cfg.ifTense);
      setSentenceAnalysis({
        parts: [
          { text: 'If', type: 'conditional-if', color: 'pink',
            explanation: (language === 'es'
              ? `Abre la condición, que va en ${tnCond?.nameEs}. El tipo de condicional fija ese tiempo: no se elige.`
              : `Opens the condition, which goes in ${tnCond?.nameEn}. The conditional type fixes that tense; you don't pick it.`),
            original: 'If', changed: false },
          ...conComa(bajaPrimera(piezasCond)),
          ...bajaPrimera(piezasRes),
        ],
      });
      setShowAnalysisDetails(false);
      return frase;
    }

    const sentence = buildSentenceText({ mode: modoMotor, ...params });
    setGeneratedSentence(sentence);

    /* «Ver los 3 modos» compara afirmativa / negativa / interrogativa de una
       oración con sujeto conocido. La pregunta de sujeto no tiene ese trío: sin
       campo Sujeto saldría « calls you.» y «Does  call you?». */
    setAllModeSentences(esPregSujeto ? null : {
      aff: buildSentenceText({ mode: 'affirmative',   ...params }),
      neg: buildSentenceText({ mode: 'negative',      ...params }),
      int: buildSentenceText({ mode: 'interrogative', ...params }),
    });

    /* El análisis usa el MISMO motor que el texto (auxiliar + forma verbal).
       En la pregunta de sujeto la concordancia sale de la wh, no del campo
       Sujeto, que está vacío: «Who has called?» pero «How many people have
       called?». Y como ese modo no es negativo ni interrogativo, el motor cae
       en la rama afirmativa, que es justo el orden que necesita. */
    const sujetoConcordancia = esPregSujeto ? (fullWhWord || 'who') : subject;
    const { auxiliary, verbForm } = getAuxAndVerbForm(sujetoConcordancia, verb, selectedTense, selectedModal, modoMotor);
    setSentenceAnalysis(generateSentenceAnalysis({
      subjectText: esPregSujeto ? (fullWhWord || 'who') : subject,
      verbText: verb,
      complementText: complement,
      auxiliary,
      verbForm,
      tenseId: selectedTense,
      mode: modoMotor,
      modalId: selectedModal,
      whWordText: fullWhWord,
      adverbText: adverb
    }));
    return sentence;
  };

  // Llevar la vista a la oración generada al pulsar "Generar" (queda escondida en móvil)
  const sentenceRef = useRef(null);

  /* Enter avanza al siguiente campo. Sin esto había que tocar fuera del cuadro
     para salir, y en el verbo era peor: la lista de sugerencias tapa el campo de
     complemento en móvil (los campos se apilan), así que el toque caía sobre una
     sugerencia en vez de sobre el campo. */
  const subjectRef = useRef(null);
  const verbRef = useRef(null);
  const complementRef = useRef(null);
  const advanceOnEnter = (e, nextRef) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    setShowVerbSuggestions(false);
    if (nextRef) nextRef.current?.focus();
    else { e.currentTarget.blur(); generateSentence(); }
  };
  const [genTick, setGenTick] = useState(0);
  useEffect(() => {
    if (!genTick || !sentenceRef.current) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sentenceRef.current.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [genTick]);

  /* La regla vive en validation.js y tiene sus pruebas; aquí solo se consulta.
     Los DOS verbos pasan por ella: el de la oración y el de la condición. Dejar
     fuera el de la condición habría dejado el agujero justo donde hay dos
     casillas de verbo y es más fácil equivocarse de casilla. */
  const revisionVerbo = revisarVerboAntesDeGenerar(verbValidation, verbBaseSuggestion);
  const revisionCondVerbo = useMemo(() => {
    if (!esCondicional || !condVerb.trim()) return { confirmar: false, tipo: null, aviso: null };
    const v = validateVerb(condVerb, language);
    return { ...revisarVerboAntesDeGenerar(v, detectConjugatedVerbBase(condVerb)), aviso: v.warning };
  }, [esCondicional, condVerb, language]);
  const avisoVerbo = confirmVerbo && (revisionVerbo.confirmar || revisionCondVerbo.confirmar);

  const generateSentence = () => {
    /* La condicional NO pasa por el selector de tiempos —el tipo los fija—, así
       que exigir tiempo o modal la bloqueaba con todo relleno. Y el aviso dice
       QUÉ cláusula falta: el genérico dejaba adivinando con los seis campos
       llenos a la vista. */
    if (esCondicional) {
      const faltaCond = !condSubject.trim() || !condVerb.trim();
      const faltaRes = !subject.trim() || !verb.trim();
      if (faltaCond || faltaRes) {
        const es = language === 'es';
        showNotification('error',
          faltaCond && faltaRes ? (es ? 'Completa el sujeto y el verbo de las dos cláusulas' : 'Fill in the subject and verb of both clauses')
          : faltaCond ? (es ? 'Falta el sujeto o el verbo de la condición' : 'The condition is missing its subject or verb')
          : (es ? 'Falta el sujeto o el verbo del resultado' : 'The result is missing its subject or verb'));
        return;
      }
    } else
    // Si hay modal, no se requiere tiempo. Si no hay modal, sí se requiere tiempo.
    // En la pregunta de sujeto no hay campo Sujeto: lo ocupa la wh.
    if ((!subject && !esPregSujeto) || !verb || (!selectedModal && !selectedTense)) {
      showNotification('error', language === 'es' ? 'Por favor completa todos los campos' : 'Please complete all fields');
      return;
    }

    /* Verbo dudoso: el primer toque avisa, el segundo genera. Pasó en clase el
       27-ago-2026 — «somebody» en la casilla del verbo, aviso en rojo bajo el
       campo, y oración generada igual porque el botón no cambiaba. No se
       BLOQUEA a propósito: la lista de verbos es finita y dejar al alumno sin
       poder trabajar sería peor que una oración rara. Se le cobra un toque. */
    if ((revisionVerbo.confirmar || revisionCondVerbo.confirmar) && !confirmVerbo) {
      setConfirmVerbo(true);
      return;
    }

    setWhWarning(validateWhExtension(whExtension));
    const sentence = computeSentenceDisplay();
    setGenTick(t => t + 1);   // dispara el scroll a la oración

    // FASE 1: Guardar en historial y actualizar estadísticas
    const newHistoryItem = {
      sentence,
      timestamp: new Date().toISOString(),
      config: {
        subject,
        verb,
        complement,
        tense: tenses.find(t => t.id === selectedTense),
        mode: modoMotor,
        modal: selectedModal,
        level: cefrLevel,
      }
    };

    setSentenceHistory(prev => [newHistoryItem, ...prev].slice(0, 20)); // Mantener últimas 20
    incrementStats();
    recordPracticeDay();
  };

  // Tiempo real: una vez generada la primera oración, cualquier cambio de
  // tiempo, modo o entradas actualiza la vista al instante (sin tocar historial)
  useEffect(() => {
    if (!generatedSentence) return;
    /* La condicional no pasa por el selector de tiempos —el tipo los fija—, así
       que exigirle tiempo o modal la dejaba SIN actualización en vivo: ya se
       había generado, pero tocar cualquier campo no cambiaba nada. Es el mismo
       descuido que tenía la validación al enviar, corregido allá y no aquí. */
    if (esCondicional) {
      if (!condSubject.trim() || !condVerb.trim() || !subject.trim() || !verb.trim()) return;
    } else if ((!subject && !esPregSujeto) || !verb || (!selectedModal && !selectedTense)) return;
    computeSentenceDisplay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, verb, complement, selectedTense, selectedMode, selectedModal, whWord, whExtension, selectedAdverb, language,
      esCondicional, tipoCond, condNeg, condSubject, condVerb, condComplement, whEsSujeto]);

  const verbSuggestions = getVerbSuggestions();


  // Cerrar panel activo

  // Avanzar a la siguiente pregunta de práctica (botón "Siguiente" y tecla Enter)
  const nextPractice = () => {
    /* Décimo ejercicio ya corregido: "Siguiente" cierra la ronda en vez de
       generar otro que nadie va a ver. */
    if (ronda.hechos >= RONDA) { setPracticeResult(null); return; }
    if (practiceType === 'review') {
      /* Si la ronda empezó adelantada, sigue adelantada: si no, el segundo
         ejercicio caería en «estás al día» y la ronda se cortaría sola. */
      startReview(false, !!practiceQuestion?.adelantado);
    } else {
      setPracticeQuestion(generatePracticeQuestion(practiceType));
      setPracticeAnswer('');
      setPracticeResult(null);
      setIdentifyTenseAnswer('');
      setIdentifyModeAnswer('');
      setShowHint(false);
    }
  };

  // Con el resultado a la vista, Enter avanza. Sin esto el flujo de teclado se
  // corta: el input queda disabled tras responder y hay que ir al mouse.
  useEffect(() => {
    if (!practiceResult) return;
    const onKey = (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      nextPractice();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceResult, practiceType]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#f5f6fb]">
      {/* Panel de reporte. El texto va en un textarea de solo lectura y no en un
          <pre>: así el alumno puede seleccionarlo a mano si el portapapeles
          falla, que en un iframe o sin HTTPS pasa. */}
      {reporte !== null && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-3" role="dialog" aria-modal="true" aria-label={t.reportar}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-4 sm:p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-gray-800">{t.reportar}</h3>
                <p className="text-xs text-gray-600 mt-0.5">{t.reporteAyuda}</p>
              </div>
              <button onClick={() => setReporte(null)} aria-label={t.close} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Los tres pasos, numerados. Aquí el número SÍ dice algo: es una
                secuencia y hay que hacerla en ese orden. */}
            <ol className="text-xs text-gray-700 space-y-1 list-decimal list-inside marker:font-bold marker:text-indigo-600">
              <li>{t.reportePaso1}</li>
              <li>{t.reportePaso2}</li>
              <li>{t.reportePaso3}</li>
            </ol>
            <textarea
              readOnly value={reporte} rows={11}
              onChange={() => {}}
              className="w-full text-xs font-mono p-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-800"
            />
            <div className="flex flex-wrap gap-2">
              <button onClick={copiarReporte} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 flex items-center gap-1.5">
                {reporteCopiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {reporteCopiado ? t.copiado : t.copiar}
              </button>
              {/* El hover NO cambia el fondo: `text-indigo-700` sobre
                  `bg-indigo-50` da 2,00:1 en oscuro, porque la capa oscura
                  invierte el fondo y deja la tinta donde estaba. Se marca con
                  el borde, que no depende del tema. */}
              <button onClick={abrirCorreo} className="px-3 py-2 rounded-lg border border-indigo-300 text-indigo-700 text-sm font-semibold hover:border-indigo-500">
                {t.abrirCorreo}
              </button>
            </div>
          </div>
        </div>
      )}
      {badgeToasts.length > 0 && (
        <div className="fixed left-0 right-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none" aria-live="polite">
          {badgeToasts.map(({ id, key }) => {
            const ci = key.indexOf(':'); const bid = ci < 0 ? key : key.slice(0, ci); const tid = ci < 0 ? null : key.slice(ci + 1);
            const b = BADGES.find(x => x.id === bid); if (!b) return null;
            let name = language === 'es' ? b.name.es : b.name.en;
            if (tid) { const o = tenses.find(x => x.id === tid); name = name.replace('{tense}', o ? (language === 'es' ? o.nameEs : o.nameEn) : tid); }
            return (
              <div key={id} role="status" className="gtoast-in pointer-events-auto flex items-center gap-2.5 max-w-sm px-3.5 py-2.5 rounded-xl text-red-950 shadow-lg bg-gradient-to-br from-rose-400 to-amber-400">
                <span className="text-2xl leading-none">{b.icon}</span>
                <span className="flex flex-col leading-tight">
                  <b className="text-[0.68rem] uppercase tracking-wide opacity-90 font-extrabold">{language === 'es' ? '¡Logro!' : 'Achievement!'}</b>
                  <span className="text-sm font-semibold">{name}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
      {/* Notificación */}
      {notification && (
        <div role="status" aria-live="polite" className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-lg shadow-lg ${
          notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-500 text-green-950'
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
            <span className="font-medium text-sm">{notification.message}</span>
          </div>
        </div>
      )}

      {/* Sección activa — vista inline (modelo de pestañas), no overlay */}
      {activePanel && (
        <div className="flex-1 overflow-y-auto py-4 px-4 sm:px-8 pb-24 sm:pb-6" style={{ order: 1 }}>
          {/* La tabla pide más ancho que el resto de los paneles: con `max-w-2xl`
              las tres columnas de formas se apretaban y en PC sobraba pantalla
              a los lados. */}
          <div className={`${activePanel === 'tiempos' ? 'max-w-5xl' : 'max-w-2xl'} mx-auto`}>
            {/* Salir de la sección al constructor. Antes solo se podía por la
                barra de abajo, así que el único «atrás» a la vista era el del
                Hub —arriba a la izquierda, donde uno mira— y se llevaba los
                clics que iban dirigidos aquí. Nombra el destino, igual que el
                del Hub nombra el suyo. */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setActivePanel(null)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 hover:text-gray-700 transition-colors shrink-0"
              >
                ← {t.builderShort}
              </button>
              <h2 className="font-bold text-xl text-gray-800">
                {activePanel === 'history' && t.history}
                {activePanel === 'practice' && t.practiceMode}
                {activePanel === 'guide' && t.timeGuideTitle}
                {activePanel === 'settings' && t.themes}
                {activePanel === 'progress' && t.progressTitle}
                {activePanel === 'tiempos' && t.tenseTableTitle}
              </h2>
            </div>

            <div>
              {/* Panel de Historial */}
              {activePanel === 'history' && (
                <div className="space-y-3">
                  {sentenceHistory.length === 0 ? (
                    <div className="text-center py-12 text-muted">
                      <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>{t.noHistory}</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <button onClick={exportHistory} className="flex-1 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-100 flex items-center justify-center gap-2">
                          <BookOpen className="w-4 h-4" /> {language === 'es' ? 'Exportar' : 'Export'}
                        </button>
                        <button
                          onClick={clearHistory}
                          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                            confirmClear
                              ? 'bg-red-600 text-white hover:bg-red-700'
                              : 'bg-red-50 text-red-700 hover:bg-red-100'
                          }`}
                        >
                          <Trash2 className="w-4 h-4" />
                          {confirmClear
                            ? (language === 'es' ? '¿Seguro? Toca de nuevo' : 'Sure? Tap again')
                            : t.clearHistory}
                        </button>
                      </div>
                      {sentenceHistory.map((item, index) => {
                        const tenseName = language === 'es' ? item.config.tense?.nameEs : item.config.tense?.nameEn;
                        /* El historial SÍ guarda la wh-word, así que aquí el tipo
                           de pregunta se puede decir de verdad y no suponerlo:
                           con wh-word es abierta, sin ella cerrada. La de sujeto
                           es abierta por definición — la wh-word ES el sujeto. */
                        const modo = item.config.mode;
                        const tipoPregunta = modo === 'subject-question' ? 'open'
                          : modo === 'interrogative' ? (item.config.whWord ? 'open' : 'closed')
                          : null;
                        return (
                          <div key={index} className="bg-gray-50 p-4 rounded-xl border">
                            <p className="font-medium text-gray-800 mb-2">{item.sentence}</p>
                            <div className="flex flex-wrap gap-1.5 text-xs">
                              {tenseName && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">{tenseName}</span>}
                              {item.config.modal && <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full">{item.config.modal}</span>}
                              <FormChip form={modo === 'subject-question' ? 'interrogative' : modo}
                                        type={tipoPregunta} lang={language}
                                        label={modo === 'subject-question' ? t.subjectQuestion : undefined} />
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full ml-auto">{formatTimestamp(item.timestamp)}</span>
                            </div>
                            <div className="flex gap-2 mt-3">
                              <button onClick={() => copyToClipboard(item.sentence)} className="p-2 hover:bg-indigo-100 rounded-lg"><Copy className="w-4 h-4 text-indigo-600" /></button>
                              <button onClick={() => deleteFromHistory(index)} className="p-2 hover:bg-red-100 rounded-lg"><Trash2 className="w-4 h-4 text-red-600" /></button>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}

              {/* Panel de Práctica */}
              {activePanel === 'practice' && (
                <div className="space-y-4">
                  {/* HASTA DÓNDE VA LA CLASE. Va aquí y no junto al nivel a
                      propósito: el nivel hace falta en toda la app, pero la
                      unidad solo cambia algo en la PRÁCTICA — que es la que
                      corrige y puntúa. Preguntarlo en la portada sería una
                      segunda barrera de entrada para quien solo viene a construir
                      oraciones.
                      Se pregunta la primera vez (unidadCurso === null), después
                      queda como una línea compacta, y vuelve a preguntar cuando
                      la respuesta caduca. Esa tercera vuelta existe porque «fácil
                      de mover» no bastó: el curso avanza cada semana y nadie
                      mueve un ajuste que puso una vez. */}
                  {!practiceQuestion && (() => {
                    /* UN SOLO control en los dos estados, y es un `select`: la
                       lista de unidades llega a 18 en Intermedio II, que en un
                       teléfono son cinco filas de fichas. El desplegable ocupa
                       una fila y sigue a la vista — que era la condición.
                       Es además el mismo control que la app ya usa para el nivel.
                       La primera vez lleva encima la explicación de POR QUÉ se
                       pregunta; después se queda solo, en una línea. */
                    const sinResponder = unidadCurso === null;
                    const selector = (
                      <select
                        value={sinResponder ? '__' : unidadCurso}
                        onChange={(e) => setUnidadCurso(e.target.value)}
                        className="px-2 py-1 border border-indigo-300 rounded-lg bg-white text-sm font-semibold text-indigo-600"
                      >
                        {sinResponder && <option value="__" disabled>{t.unidadElige}</option>}
                        <option value="">{t.unidadTodo}</option>
                        {(UNIDADES_POR_CURSO[cefrLevel] || []).map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    );
                    /* La revisión repite la forma de TARJETA de la primera vez a
                       propósito: es la única forma que el alumno ya aprendió a
                       leer como «esto te pregunta algo». La línea gris no la lee
                       nadie, que es literalmente cómo empezó todo esto (se
                       reportó el selector como desaparecido, y estaba ahí).
                       Tapa el selector de contenido mientras dura, igual que la
                       primera vez: es un toque, y así la pregunta no se puede
                       pasar por alto. */
                    return sinResponder || hayQueRevisarUnidad ? (
                      <div className="p-3 rounded-xl border-2 border-indigo-200 bg-indigo-50">
                        <p className="font-semibold text-gray-800 text-sm">
                          {sinResponder ? t.unidadPregunta : t.unidadRevisar.replace('{u}', unidadCurso)}
                        </p>
                        <p className="text-xs text-gray-600 mt-1 mb-2">
                          {sinResponder ? t.unidadPorQue : t.unidadRevisarPorQue}
                        </p>
                        {sinResponder ? selector : (
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Confirmar va primero: es lo que va a tocar la mayoría. */}
                            <button
                              onClick={sellarUnidadFecha}
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
                            >
                              {t.unidadSeguimos}
                            </button>
                            {selector}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-gray-600">
                        <span>{unidadCurso ? t.unidadVas : t.unidadTodoCurso}</span>
                        {selector}
                        {/* TEMA. La mezcla va primera y marcada como recomendada
                            porque lo es: practicar contenidos mezclados retiene
                            bastante mejor que hacerlo por bloques. Lo focalizado
                            existe para machacar algo concreto, no para sustituirla. */}
                        <span className="ml-1">{t.temaEtiqueta}</span>
                        <select
                          value={practiceTema}
                          onChange={(e) => setPracticeTema(e.target.value)}
                          className="px-2 py-1 border border-indigo-300 rounded-lg bg-white text-sm font-semibold text-indigo-600 max-w-[11rem]"
                        >
                          <option value="">{t.temaMezcla}</option>
                          {/* «(to be)» cuando el tiempo solo se ha visto en su
                              etapa temprana: el alumno debe saber que ahí se
                              practica «I am at home», no «I work every day». */}
                          {tenses.filter(yaVisto).map(tn => (
                            <option key={tn.id} value={tn.id}>
                              {(language === 'es' ? tn.nameEs : tn.nameEn) + (soloBe(tn) ? ' (to be)' : '')}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })()}
                  {/* Sin ningún tiempo visto no hay práctica posible: en Básico I
                      el primero llega en la 5A, así que un alumno en la 2A tiene
                      el conjunto vacío. Antes eso escogía `undefined` de una lista
                      vacía y reventaba; ahora se dice, que además es la verdad. */}
                  {!practiceQuestion && !tenses.some(yaVisto) ? (
                    <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 text-center">
                      <p className="font-semibold text-gray-800">{t.unidadSinContenido}</p>
                      <button onClick={() => setUnidadCurso(null)} className="mt-2 text-sm font-semibold text-indigo-600 underline">
                        {t.unidadCambiar}
                      </button>
                    </div>
                  ) : !practiceQuestion ? (
                    <div className="space-y-3">
                      {/* «Al día» es una RECOMPENSA, no un error, pero antes dejaba
                          al alumno en una pantalla sin salida y con una fecha
                          inventada: decía «vuelve mañana» aunque el intervalo
                          fuera de treinta días. Ahora dice cuándo vuelve de
                          verdad y ofrece las dos salidas.
                          El comentario va AQUÍ y no dentro del ternario: ahí sería
                          una segunda expresión y no compila. */}
                      {reviewUpToDate ? (
                        <div className="text-center py-10">
                          <p className="text-4xl mb-3">✅</p>
                          <p className="font-semibold text-gray-700">{language === 'es' ? '¡Estás al día!' : "You're up to date!"}</p>
                          <p className="text-sm text-muted mt-1">
                            {estadoRepaso.tipo === 'alDia'
                              ? (language === 'es' ? `Lo próximo que toca repasar está listo ${textoCuando(estadoRepaso.dias)}.`
                                                   : `The next review is ready ${textoCuando(estadoRepaso.dias)}.`)
                              : (language === 'es' ? 'Practica un poco y aparecerá lo que toque repasar.'
                                                   : 'Practise a little and what to review will show up here.')}
                          </p>
                          <div className="mt-4 flex flex-wrap gap-2 justify-center">
                            {estadoRepaso.tipo === 'alDia' && estadoRepaso.debil && (
                              <button onClick={() => { setReviewUpToDate(false); startReview(true, true); }}
                                /* `bg-amber-50 + text-amber-700`: es el par que la
                                   capa oscura sabe invertir. Con el -900 sobre
                                   -200 daba 1,45:1 en oscuro. Y el hover marca
                                   el BORDE, no el fondo, por lo mismo. */
                                className="px-4 py-2 bg-amber-50 text-amber-700 border border-amber-400 rounded-lg text-sm font-semibold hover:border-amber-600">
                                {language === 'es' ? 'Repasar igual lo que peor llevas' : 'Review your weakest one anyway'}
                              </button>
                            )}
                            <button onClick={() => setReviewUpToDate(false)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200">
                              {language === 'es' ? 'Elegir otra actividad' : 'Pick another activity'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-gray-600 text-sm mb-4">{t.practiceSubtitle}</p>
                          {/* MODO REPASO. El botón dice en qué estado está ANTES
                              de entrar: es la primera actividad del menú y antes
                              podías toparte con una puerta cerrada sin aviso.
                              Con material se ve como acción principal; sin él,
                              apagado y con el motivo escrito. */}
                          {(() => {
                            const E = estadoRepaso;
                            const hay = E.tipo === 'pendientes';
                            const sub = E.tipo === 'pendientes'
                              ? (language === 'es' ? `${E.n} ${E.n === 1 ? 'estructura lista' : 'estructuras listas'} para repasar` : `${E.n} ${E.n === 1 ? 'structure' : 'structures'} ready to review`)
                              : E.tipo === 'sinDatos'
                                ? (language === 'es' ? 'Practica un poco y aparecerá lo que toque repasar' : 'Practise a little and what to review will show up here')
                                : (language === 'es' ? `Al día. Lo próximo, ${textoCuando(E.dias)}` : `Up to date. Next one ${textoCuando(E.dias)}`);
                            return (
                              <button
                                onClick={() => startReview(true)}
                                disabled={!hay}
                                className={`w-full p-4 rounded-xl border-2 text-left transition-all relative ${
                                  hay ? 'bg-amber-50 border-amber-300 hover:border-amber-500'
                                      : 'bg-gray-50 border-transparent opacity-70 cursor-default'
                                }`}
                              >
                                <span className="text-2xl mr-3">🔄</span>
                                <span className="font-semibold">{language === 'es' ? 'Modo Repaso' : 'Review Mode'}</span>
                                <p className="text-xs text-gray-600 mt-1 ml-9">{sub}</p>
                                {hay && (
                                  <span className="absolute top-3 right-3 bg-red-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                                    {E.n > 9 ? '9+' : E.n}
                                  </span>
                                )}
                              </button>
                            );
                          })()}
                          {/* Adelantar: solo cuando está al día Y hay algo flojo
                              que ofrecer. Va como enlace y no como botón para que
                              no compita con los modos: es una salida, no un modo. */}
                          {estadoRepaso.tipo === 'alDia' && estadoRepaso.debil && (
                            <button
                              onClick={() => startReview(true, true)}
                              className="w-full -mt-1 mb-1 px-4 py-1.5 text-xs font-semibold text-amber-700 underline text-left"
                            >
                              {language === 'es' ? 'Repasar igual lo que peor llevas' : 'Review your weakest one anyway'}
                            </button>
                          )}
                          {[
                            { type: 'fill', icon: '📝', title: t.fillInBlank, desc: language === 'es' ? 'Completa la oración' : 'Complete the sentence' },
                            /* «Corrige el error» necesita un tiempo con verbos
                               normales: no se ofrece mientras solo se haya visto
                               la etapa de `be`. */
                            ...(tenses.filter(yaVisto).some(tn => !soloBe(tn))
                              ? [{ type: 'correct', icon: '✏️', title: t.correctError, desc: language === 'es' ? 'Corrige el error' : 'Correct the error' }]
                              : []),
                            { type: 'identify', icon: '🔍', title: language === 'es' ? 'Identificar estructura' : 'Identify structure', desc: language === 'es' ? 'Reconoce el tiempo/estructura verbal y el modo' : 'Recognize the tense/structure and mode' },
                            /* Solo si el alumno ya vio alguna condicional: antes de
                               eso la actividad no tendría de dónde sacar un tipo y
                               quedaría vacía. */
                            ...(CONDICIONALES_POR_CURSO.some(yaVisto)
                              ? [{ type: 'conditional', icon: '⇒',
                                   title: language === 'es' ? 'Completa la condicional' : 'Complete the conditional',
                                   desc: language === 'es' ? 'La app te da una mitad; escribe la otra'
                                                           : 'The app gives you one half; write the other' }]
                              : []),
                          ].map(p => (
                            <button key={p.type} onClick={() => startPractice(p.type)} className="w-full p-4 bg-gray-50 hover:bg-indigo-50 rounded-xl border-2 border-transparent hover:border-indigo-200 text-left transition-all">
                              <span className="text-2xl mr-3">{p.icon}</span>
                              <span className="font-semibold">{p.title}</span>
                              <p className="text-xs text-muted mt-1 ml-9">{p.desc}</p>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  ) : (
                    rondaTerminada ? (
                      /* Cierre de ronda: mismo formato que Question Lab, para que
                         practicar en una app y en otra se sienta igual. */
                      <div className="text-center py-8 px-4">
                        <p className="text-5xl font-extrabold text-indigo-600 leading-none">{ronda.ok} / {RONDA}</p>
                        <p className="text-sm text-muted mt-2">
                          {language === 'es' ? 'Ronda terminada' : 'Round complete'}
                        </p>
                        {ronda.mejor > 1 && (
                          <p className="text-sm mt-3">🔥 {language === 'es' ? 'Mejor racha' : 'Best streak'}: {ronda.mejor}</p>
                        )}
                        {ronda.ok === RONDA && (
                          <p className="text-sm mt-1">⭐ {language === 'es' ? '¡Ronda perfecta!' : 'Perfect round!'}</p>
                        )}
                        <div className="flex gap-2 justify-center mt-6 flex-wrap">
                          <button
                            onClick={() => practiceType === 'review' ? startReview(true) : startPractice(practiceType)}
                            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold"
                          >
                            {language === 'es' ? 'Otra ronda' : 'Another round'}
                          </button>
                          {/* El menú es lo que se ve cuando no hay pregunta, así que
                              volver es soltar la pregunta; con solo apagar
                              practiceMode el alumno quedaba en el mismo ejercicio. */}
                          <button
                            onClick={() => {
                              setPracticeMode(false);
                              setPracticeQuestion(null);
                              setPracticeResult(null);
                              setRonda({ hechos: 0, ok: 0, mejor: 0 });
                            }}
                            className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold"
                          >
                            {language === 'es' ? 'Volver' : 'Back'}
                          </button>
                        </div>
                      </div>
                    ) : (
                    <div className="space-y-4">
                      {/* Avance de la ronda: barra fina + cuenta. Sin una meta a la
                          vista la sesión no terminaba nunca y el alumno no sabía
                          cuánto le faltaba para poder parar. */}
                      <div>
                        <div className="h-1 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all duration-300 motion-reduce:transition-none"
                            style={{ width: `${ronda.hechos / RONDA * 100}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-xs font-semibold text-muted">
                            {language === 'es' ? 'Ejercicio' : 'Exercise'} {rondaEnPantalla} {language === 'es' ? 'de' : 'of'} {RONDA}
                          </span>
                          {answerStreak > 0 && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold text-red-950 bg-gradient-to-br from-rose-400 to-amber-400 shadow-sm shadow-rose-400/30">
                              🔥 {language === 'es' ? 'Racha' : 'Streak'}: {answerStreak}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Tarjeta de pregunta */}
                      {/* Colores por actividad, del sistema de la suite:
                          completar=índigo · corregir=coral · identificar=teal · repaso=ámbar */}
                      <div className={`p-4 rounded-xl border ${practiceQuestion.type === 'conditional' ? 'bg-pink-50 border-pink-200' : practiceQuestion.type === 'identify' ? 'bg-teal-50 border-teal-200' : practiceQuestion.type === 'correct' ? 'bg-rose-50 border-rose-200' : practiceQuestion.type === 'review' ? 'bg-amber-50 border-amber-200' : 'bg-indigo-50 border-indigo-200'}`}>
                        {(practiceQuestion.type === 'fill' || practiceQuestion.type === 'review') && (
                          <>
                            <p className={`text-xs font-medium mb-2 uppercase tracking-wide ${practiceQuestion.type === 'review' ? 'text-amber-600' : 'text-indigo-500'}`}>
                              {practiceQuestion.type === 'review'
                                ? (practiceQuestion.adelantado
                                    /* Se dice que va adelantado: acertarlo no
                                       adelanta el calendario, y el alumno tiene
                                       derecho a saber que esto es práctica extra
                                       y no su repaso del día. */
                                    ? (language === 'es' ? '🔄 Repaso adelantado · lo que peor llevas' : '🔄 Early review · your weakest one')
                                    : (language === 'es' ? '🔄 Repaso espaciado' : '🔄 Spaced review'))
                                : (language === 'es' ? 'Completa el verbo' : 'Fill in the verb')}
                            </p>
                            <p className="text-lg font-medium mb-1">
                              <span className="text-gray-800">{practiceQuestion.subject}</span>
                              <span className="mx-2 px-3 py-0.5 bg-white border-2 border-indigo-400 rounded text-indigo-600 font-bold">____</span>
                              <span className="text-indigo-600 text-sm font-normal">({practiceQuestion.verb})</span>
                              <span className="text-gray-800 ml-1">{practiceQuestion.complement}.</span>
                            </p>
                            <div className="flex gap-2 text-xs mt-1">
                              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">{language === 'es' ? practiceQuestion.tense.nameEs : practiceQuestion.tense.nameEn}</span>
                              <FormChip form={practiceQuestion.mode} lang={language}
                                       type={practiceQuestion.mode === 'interrogative' ? 'closed' : null} />
                            </div>
                            <input
                              type="text" value={practiceAnswer} onChange={(e) => setPracticeAnswer(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && !practiceResult && checkPracticeAnswer()}
                              placeholder={language === 'es' ? 'Escribe la frase verbal...' : 'Type the verb phrase...'}
                              /* sin `focus:outline-none`: solo cambiaba el tono del borde, que es
                                 un indicador demasiado débil. Deja pasar el anillo de dua.generated.css. */
                              className={`w-full mt-3 px-4 py-2 border-2 rounded-lg ${practiceQuestion.type === 'review' ? 'border-amber-300 focus:border-amber-500' : 'border-indigo-300 focus:border-indigo-500'}`}
                              disabled={!!practiceResult}
                            />
                          </>
                        )}
                        {practiceQuestion.type === 'conditional' && (() => {
                          const q = practiceQuestion;
                          const otra = q.parte === 'condicion' ? 'resultado' : 'condicion';
                          const cl = otra === 'condicion' ? q.cond : q.res;
                          /* La mitad que NO se pregunta se muestra ya conjugada:
                             es la pista de qué tipo es, y de ahí sale la forma
                             que toca en la otra. Esa correspondencia ES la regla. */
                          const frase = conditionalVerbPhrase({ tipo: q.tipoCond, parte: otra,
                            subject: cl.subject, verb: cl.verb });
                          const hecha = `${cl.subject} ${frase}${cl.complement ? ' ' + cl.complement : ''}`;
                          const pide = q.parte === 'condicion' ? q.cond : q.res;
                          const hueco = (
                            <>
                              <span className="text-gray-800">{pide.subject}</span>
                              <span className="mx-2 px-3 py-0.5 bg-white border-2 border-pink-400 rounded text-pink-700 font-bold">____</span>
                              <span className="text-pink-700 text-sm font-normal">({pide.verb})</span>
                              {pide.complement && <span className="text-gray-800 ml-1">{pide.complement}</span>}
                            </>
                          );
                          return (
                            <>
                              <p className="text-xs text-pink-700 font-medium mb-2 uppercase tracking-wide">
                                {q.parte === 'condicion'
                                  ? (language === 'es' ? 'Completa la condición' : 'Complete the condition')
                                  : (language === 'es' ? 'Completa el resultado' : 'Complete the result')}
                              </p>
                              <p className="text-lg font-medium mb-1">
                                <span className="text-muted">If </span>
                                {q.parte === 'condicion' ? hueco : <span className="text-gray-800">{hecha}</span>}
                                <span className="text-muted">, </span>
                                {q.parte === 'resultado' ? hueco : <span className="text-gray-800">{hecha}</span>}
                                <span className="text-gray-800">.</span>
                              </p>
                              <div className="flex gap-2 text-xs mt-1">
                                <span className="px-2 py-0.5 bg-pink-100 text-pink-900 rounded-full">
                                  ⇒ {q.tipoCond === 1 ? t.condTipo1 : q.tipoCond === 2 ? t.condTipo2 : t.condTipo3}
                                </span>
                              </div>
                              <input
                                type="text" value={practiceAnswer} onChange={(e) => setPracticeAnswer(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && !practiceResult && checkPracticeAnswer()}
                                placeholder={language === 'es' ? 'Escribe la frase verbal...' : 'Type the verb phrase...'}
                                className="w-full mt-3 px-4 py-2 border-2 rounded-lg border-pink-300 focus:border-pink-500"
                                disabled={!!practiceResult}
                              />
                            </>
                          );
                        })()}
                        {practiceQuestion.type === 'correct' && (
                          <>
                            <p className="text-xs text-rose-500 font-medium mb-2 uppercase tracking-wide">{language === 'es' ? 'Corrige el error' : 'Correct the error'}</p>
                            <p className="text-lg font-medium mb-1">
                              {showHint && practiceQuestion.wrongPart
                                ? practiceQuestion.wrongSentence.split(practiceQuestion.wrongPart).map((part, i, arr) => (
                                    <span key={i}>
                                      {part}
                                      {i < arr.length - 1 && (
                                        <span className="line-through decoration-red-400 decoration-2 text-red-400">{practiceQuestion.wrongPart}</span>
                                      )}
                                    </span>
                                  ))
                                : txt(practiceQuestion.wrongSentence)
                              }
                            </p>
                            <div className="flex items-center gap-2 text-xs mt-1 mb-3">
                              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">{language === 'es' ? practiceQuestion.tense.nameEs : practiceQuestion.tense.nameEn}</span>
                              <FormChip form={practiceQuestion.mode} lang={language}
                                       type={practiceQuestion.mode === 'interrogative' ? 'closed' : null} />
                              {!practiceResult && (
                                <button onClick={() => setShowHint(h => !h)} className="ml-auto px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full hover:bg-amber-100 transition-colors">
                                  {showHint ? (language === 'es' ? 'Ocultar pista' : 'Hide hint') : (language === 'es' ? 'Pista' : 'Hint')}
                                </button>
                              )}
                            </div>
                            <input
                              type="text" value={practiceAnswer} onChange={(e) => setPracticeAnswer(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && !practiceResult && checkPracticeAnswer()}
                              placeholder={language === 'es' ? 'Escribe la parte correcta...' : 'Write the correct part...'}
                              className="w-full px-4 py-2 border-2 border-rose-300 rounded-lg focus:border-rose-500"
                              disabled={!!practiceResult}
                            />
                          </>
                        )}
                        {practiceQuestion.type === 'identify' && (
                          <>
                            <p className="text-xs text-teal-600 font-medium mb-2 uppercase tracking-wide">
                              {practiceQuestion.askTense
                                ? (language === 'es' ? '¿Qué tiempo/estructura verbal y modo es?' : 'What tense/structure and mode is this?')
                                : (language === 'es' ? '¿Qué modo tiene esta oración?' : 'What mode is this sentence?')}
                            </p>
                            <p className="text-xl font-semibold text-gray-800 mb-4 font-['Atkinson_Hyperlegible']">"{txt(practiceQuestion.fullSentence)}"</p>
                            {/* Opciones de tiempo (solo si hay suficientes tiempos disponibles) */}
                            {practiceQuestion.askTense && (
                              <>
                                <p className="text-xs font-medium text-muted mb-2">{language === 'es' ? 'Tiempo/Estructura verbal:' : 'Tense/Structure:'}</p>
                                <div className="flex flex-wrap gap-2 mb-4">
                                  {practiceQuestion.tenseOptions.map(opt => (
                                    <button
                                      key={opt.id}
                                      onClick={() => !practiceResult && setIdentifyTenseAnswer(opt.id)}
                                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-all ${
                                        practiceResult
                                          ? opt.id === practiceQuestion.tense.id
                                            ? 'bg-green-100 border-green-400 text-green-700'
                                            : identifyTenseAnswer === opt.id && !practiceResult?.tenseOk
                                              ? 'bg-red-100 border-red-300 text-red-700'
                                              : 'bg-gray-100 border-gray-200 text-gray-600'
                                          : identifyTenseAnswer === opt.id
                                            ? 'bg-teal-100 border-teal-400 text-teal-700'
                                            : 'bg-white border-gray-200 text-gray-600 hover:border-teal-300'
                                      }`}
                                    >
                                      {/* refuerzo no cromático del resultado (DUA) */}
                                      {practiceResult && opt.id === practiceQuestion.tense.id && <span aria-hidden="true">✓ </span>}
                                      {practiceResult && identifyTenseAnswer === opt.id && opt.id !== practiceQuestion.tense.id && <span aria-hidden="true">✗ </span>}
                                      {language === 'es' ? opt.nameEs : opt.nameEn}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                            {/* Opciones de modo (siempre) */}
                            <p className="text-xs font-medium text-muted mb-2">{language === 'es' ? 'Modo:' : 'Mode:'}</p>
                            <div className="flex gap-2">
                              {[
                                { id: 'affirmative',   label: language === 'es' ? 'Afirmativa'   : 'Affirmative' },
                                { id: 'negative',      label: language === 'es' ? 'Negativa'      : 'Negative' },
                                { id: 'interrogative', label: language === 'es' ? 'Interrogativa' : 'Interrogative' },
                              ].map(m => (
                                <button
                                  key={m.id}
                                  onClick={() => !practiceResult && setIdentifyModeAnswer(m.id)}
                                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium border-2 transition-all ${
                                    practiceResult
                                      ? m.id === practiceQuestion.mode
                                        ? 'bg-green-100 border-green-400 text-green-700'
                                        : identifyModeAnswer === m.id && !practiceResult?.modeOk
                                          ? 'bg-red-100 border-red-300 text-red-700'
                                          : 'bg-gray-100 border-gray-200 text-gray-600'
                                      : identifyModeAnswer === m.id
                                        ? 'bg-teal-100 border-teal-400 text-teal-700'
                                        : 'bg-white border-gray-200 text-gray-600 hover:border-teal-300'
                                  }`}
                                >
                                  {practiceResult && m.id === practiceQuestion.mode && <span aria-hidden="true">✓ </span>}
                                  {practiceResult && identifyModeAnswer === m.id && m.id !== practiceQuestion.mode && <span aria-hidden="true">✗ </span>}
                                  {m.label}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Resultado */}
                      {practiceResult && (
                        <div className={`p-4 rounded-xl ${practiceResult.correct ? 'bg-green-50 border border-green-300' : 'bg-red-50 border border-red-300'}`}>
                          <p className={`font-bold ${practiceResult.correct ? 'text-green-700' : 'text-red-700'}`}>{practiceResult.correct ? t.correct : t.incorrect}</p>
                          {practiceQuestion.type === 'identify' ? (
                            <div className="text-sm mt-1 space-y-0.5">
                              {!practiceResult.tenseOk && <p className="text-red-600">{language === 'es' ? 'Tiempo correcto:' : 'Correct tense:'} <span className="font-semibold">{practiceResult.correctTense}</span></p>}
                              {practiceQuestion.askMode && !practiceResult.modeOk && <p className="text-red-600">{language === 'es' ? 'Modo correcto:' : 'Correct mode:'} <span className="font-semibold">{practiceResult.correctMode}</span></p>}
                            </div>
                          ) : (
                            <>
                              {!practiceResult.correct && <p className="text-sm text-red-600 mt-1">{t.theCorrectAnswer}: <span className="font-semibold">{practiceResult.correctAnswer}</span></p>}
                              {/* Cuenta como acierto y ADEMÁS se explica. Marcarlo
                                  mal enseñaría que «was» está prohibido, y no lo
                                  está: es la forma coloquial y existe. */}
                              {practiceResult.avisoWas && (
                                <p className="text-sm text-pink-900 bg-pink-50 border border-pink-200 rounded-lg px-3 py-2 mt-2">
                                  {t.condWereAviso}
                                </p>
                              )}
                              {practiceResult.hint && (
                                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                                  💡 {practiceResult.hint}
                                </p>
                              )}
                              <p className="text-sm text-gray-600 mt-2">{language === 'es' ? 'Oración completa:' : 'Full sentence:'} <span className="font-medium text-gray-800">{practiceResult.fullSentence}</span></p>
                            </>
                          )}
                        </div>
                      )}

                      {/* Botones acción */}
                      <div className="flex gap-2">
                        {!practiceResult ? (
                          <button
                            onClick={checkPracticeAnswer}
                            disabled={practiceQuestion.type === 'identify' && ((practiceQuestion.askTense && !identifyTenseAnswer) || !identifyModeAnswer)}
                            className="flex-1 px-4 py-2 bg-green-700 text-white rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                          >{t.checkAnswer}</button>
                        ) : (
                          <button onClick={nextPractice} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium">
                            {t.nextQuestion} <span className="opacity-60 font-normal hidden sm:inline">(Enter)</span>
                          </button>
                        )}
                        {/* Era `bg-gray-200` plano, o sea el MISMO gris que el
                            «← Constructor» de arriba (`bg-gray-100`), siendo
                            destinos distintos: uno suelta el ejercicio y el otro
                            sale de la sección. Ahora va con borde marcado y texto
                            pleno: se lee como salida sin competir con el relleno
                            sólido de «Siguiente», que es la acción. El tono del
                            borde es propio (`btn-salir` en index.css) porque los
                            `border-gray-*` de Tailwind caen a #2a3042 en oscuro y
                            ahí el borde desaparecería. */}
                        <button onClick={() => { setPracticeQuestion(null); setPracticeAnswer(''); setPracticeResult(null); setIdentifyTenseAnswer(''); setIdentifyModeAnswer(''); setReviewUpToDate(false); }} className="btn-salir px-4 py-2 rounded-lg font-bold text-gray-800">{t.exitPractice}</button>
                      </div>
                    </div>
                    )
                  )}
                </div>
              )}

              {/* Panel de Guía de uso. Al final va la autoría: presente pero
                  fuera del camino. No es información que el alumno necesite
                  mientras practica, y una franja fija se come pantalla en un
                  teléfono. El aviso que pesa a efectos legales es el del código
                  y el LICENSE del repositorio; esto es para quien mire quién
                  hizo la app. */}
              {/* LA TABLA DE TIEMPOS. Material de consulta, no una actividad, y
                  aun así en la barra: estar fuera no la hacía menos visitada,
                  la hacía inalcanzable sin pasar por la Guía. Ahora la pestaña
                  es la única puerta; ver `activePanel` para las dos que había
                  antes, y la barra para el ancho. */}
              {activePanel === 'tiempos' && (
                <TablaTiempos language={language} cefrLevel={cefrLevel} />
              )}

              {activePanel === 'guide' && (
                <>
                  <UsageGuide language={language} cefrLevel={cefrLevel} />
                  <p className="mt-6 text-[11px] text-muted text-center">
                    Grammaster · © 2025-2026 Víctor Manuel Morales Muñoz · {t.derechos}
                  </p>
                </>
              )}

              {/* Panel de Progreso */}
              {activePanel === 'progress' && (() => {
                const streak = computeStreak(practiceDays);
                const tenseStats = computeTenseStats();
                const hasData = totalAllTime > 0;
                // Racha de TODA la suite (gh_progress, cualquier app cuenta) —
                // puede diferir de la local y confundir si no se distingue.
                let suiteStreak = 0;
                try { suiteStreak = loadProgress(window.localStorage)?.dayStreak?.count || 0; } catch { /* sin datos */ }

                // Últimos 30 días para el calendario
                /* `todayISO` y no `toISOString()`: si el calendario fecha en UTC
                   y los días se guardan en local, los cuadritos se pintan
                   corridos un día. */
                const last30 = Array.from({ length: 30 }, (_, i) => {
                  const d = new Date(); d.setDate(d.getDate() - (29 - i));
                  return todayISO(d);
                });
                const daySet = new Set(practiceDays);

                // Tenses con datos + tenses disponibles hasta nivel actual
                const courseIndex = COURSE_ORDER.indexOf(cefrLevel);
                const unlockedTenses = tenses.filter(t => COURSE_ORDER.indexOf(t.cefr) <= courseIndex);
                const sortedTenses = [...unlockedTenses].sort((a, b) => (tenseStats[b.id] || 0) - (tenseStats[a.id] || 0));
                const maxCount = Math.max(...sortedTenses.map(t => tenseStats[t.id] || 0), 1);

                // Tiempo verbal más usado
                const topEntry = Object.entries(tenseStats).sort((a, b) => b[1] - a[1])[0];
                const topTense = topEntry ? tenses.find(t => t.id === topEntry[0]) : null;

                return (
                  <div className="space-y-5">
                    {!hasData ? (
                      <div className="text-center py-12 text-muted">
                        <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p className="text-sm">{t.noDataYet}</p>
                      </div>
                    ) : (
                      <>
                        {/* 1. RACHA */}
                        <div className={`rounded-xl p-4 flex items-center gap-4 ${streak > 0 ? 'bg-gradient-to-br from-rose-400 to-amber-400 shadow-lg shadow-rose-400/30' : 'bg-gray-50 border border-gray-200'}`}>
                          <span className="text-4xl">{streak > 0 ? '🔥' : '💤'}</span>
                          <div>
                            {streak > 0 ? (
                              <>
                                <p className="text-2xl font-bold text-red-950">{streak} {streak === 1 ? t.dayStreakSingle : t.dayStreak}</p>
                                <p className="text-xs text-red-950/85">{language === 'es' ? 'Practicando en Grammaster' : 'Practicing in Grammaster'}</p>
                                {suiteStreak !== streak && suiteStreak > 0 && (
                                  <p className="text-xs text-white/75 mt-0.5">{language === 'es' ? `Toda la suite: ${suiteStreak} días` : `Whole suite: ${suiteStreak} days`}</p>
                                )}
                              </>
                            ) : (
                              <>
                                <p className="text-lg font-bold text-muted">0 {t.dayStreak}</p>
                                <p className="text-xs text-muted">{t.noStreakYet}</p>
                                {suiteStreak > 0 && (
                                  <p className="text-xs text-muted mt-0.5">{language === 'es' ? `Toda la suite: ${suiteStreak} días` : `Whole suite: ${suiteStreak} days`}</p>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* 2. CALENDARIO */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-gray-700">{t.practiceCalendar}</p>
                            <p className="text-xs text-muted">{t.last30Days}</p>
                          </div>
                          <div className="grid grid-cols-10 gap-1">
                            {last30.map(day => (
                              <div
                                key={day}
                                title={day}
                                className={`aspect-square rounded-sm ${daySet.has(day) ? 'bg-indigo-500' : 'bg-gray-100'}`}
                              />
                            ))}
                          </div>
                          <div className="flex items-center gap-2 mt-2 justify-end">
                            <div className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-200" />
                            <span className="text-xs text-muted">{language === 'es' ? 'Sin práctica' : 'No practice'}</span>
                            <div className="w-3 h-3 rounded-sm bg-indigo-500 ml-2" />
                            <span className="text-xs text-muted">{language === 'es' ? 'Practicó' : 'Practiced'}</span>
                          </div>
                        </div>

                        {/* 3. TIEMPOS VERBALES */}
                        <div>
                          <p className="text-sm font-semibold text-gray-700 mb-3">{t.tenseProgress}</p>
                          <div className="space-y-2.5">
                            {sortedTenses.map(tenseItem => {
                              const count = tenseStats[tenseItem.id] || 0;
                              const pct = Math.round((count / maxCount) * 100);
                              const status = count >= 10 ? 'dominated' : count >= 3 ? 'practicing' : 'unexplored';
                              const statusColors = {
                                dominated: 'bg-emerald-100 text-emerald-700',
                                practicing: 'bg-blue-100 text-blue-700',
                                unexplored: 'bg-gray-100 text-muted',
                              };
                              const barColors = {
                                dominated: 'bg-emerald-500',
                                practicing: 'bg-blue-400',
                                unexplored: 'bg-gray-200',
                              };
                              return (
                                <div key={tenseItem.id}>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-medium text-gray-700 truncate max-w-[55%]">
                                      {language === 'es' ? tenseItem.nameEs : tenseItem.nameEn}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted">{count}</span>
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[status]}`}>
                                        {t[status]}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${barColors[status]}`} style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* 4. ESTADÍSTICAS GENERALES */}
                        <div>
                          <p className="text-sm font-semibold text-gray-700 mb-3">{t.generalStats}</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-indigo-50 rounded-xl p-3 text-center">
                              <p className="text-2xl font-bold text-indigo-600">{totalAllTime}</p>
                              <p className="text-xs text-indigo-700 mt-0.5">{t.totalAllTime}</p>
                            </div>
                            <div className="bg-blue-50 rounded-xl p-3 text-center">
                              <p className="text-2xl font-bold text-blue-600">{sessionStats.today}</p>
                              <p className="text-xs text-blue-700 mt-0.5">{t.todayCount}</p>
                            </div>
                          </div>
                          {topTense && (
                            <div className="mt-3 bg-gray-50 rounded-xl p-3">
                              <p className="text-xs text-muted mb-1">{t.mostUsedTense}</p>
                              <p className="font-semibold text-gray-800">
                                {language === 'es' ? topTense.nameEs : topTense.nameEn}
                                <span className="text-xs font-normal text-muted ml-2">({topEntry[1]} {t.sentences})</span>
                              </p>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

            </div>
          </div>
        </div>
      )}

      {/* Header full-width */}
      {/* `px-4` a secas y no `px-4 sm:px-8`: con el salto a 32px en pantalla
          ancha, esta era la única cabecera de la suite con la marca despegada
          del borde — 32px contra los 16 de Desgramatizador y Question Lab. Se
          nota al saltar de una app a otra dentro del Hub, que es como se usan.
          El contenido no se ve afectado: va en su propio `max-w-5xl` centrado. */}
      {/* En TELÉFONO y fuera del Hub la cabecera pasa a dos filas. Medido: con
          los cuatro controles puestos, la marca se queda con ~52px y
          «Grammaster» salía como «G…» — o, antes de dejarla encoger, el botón
          de Reportar terminaba en x=501 sobre un viewport de 375, o sea fuera
          de la pantalla y con scroll horizontal. No es cuestión de apretar más:
          no cabe.
          Dentro del Hub NO se parte, y por eso va condicionado a `fromHub`: allí
          el nivel y el idioma los lleva el Hub y el botón de tema no se pinta,
          así que solo queda Reportar y la fila entra de sobra. Lo que decide es
          cuántos controles hay, no el ancho. */}
      {/* DENTRO DEL HUB NO HAY CABECERA, y es la decisión, no un descuido.
          Estaban las dos apiladas —la barra del hub y esta— repitiendo el
          logo, el nombre y el botón de tema, y entre ambas se llevaban más de
          cien píxeles de alto en todas las pantallas. Ahora la barra del hub
          lleva la identidad y el tema; aquí no queda nada que no esté allá.
          Lo único que se queda de este lado es Reportar, más abajo: depende de
          si HAY algo que reportar, y eso solo lo sabe esta app. */}
      {!fromHub && (
      <header className={`flex-shrink-0 bg-white border-b border-gray-200 shadow-sm z-10 px-4 py-3 flex items-center justify-between gap-y-2 flex-wrap sm:flex-nowrap`}>
          {/* `min-w-0` en los dos niveles y `truncate` en el nombre: sin eso la
              marca no puede encogerse y toda la falta de sitio se la come el
              lado de los controles, que acaba saliéndose de la pantalla. Antes
              de que el botón de Reportar se vaya fuera del borde, que ceda el
              título. */}
          <div className="flex items-center gap-3 min-w-0">
            <img src="/grammaster/logo.svg" alt="Grammaster" className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-[22%]" />
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-gray-800 truncate">{t.title}</h1>
              <p className="text-xs text-muted hidden sm:block">{language === 'es' ? 'Los tiempos en la palma de tu mano.' : 'English tenses at your fingertips.'}</p>
            </div>
          </div>

          <div className={`flex items-center gap-1.5 ${fromHub ? '' : 'w-full justify-start sm:w-auto sm:justify-end'}`}>
            {!fromHub && <>
              {/* NIVEL selector */}
              <select
                value={cefrLevel}
                onChange={(e) => setCefrLevel(e.target.value)}
                className="px-1.5 py-1 border border-slate-200 rounded-lg text-xs font-medium text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer"
                title={language === 'es' ? 'Nivel' : 'Level'}
              >
                {GH_LEVELS.map(id => (
                  <option key={id} value={id}>{cursoLabel(id, language)}</option>
                ))}
              </select>

              {/* IDIOMA toggle */}
              <div className="flex bg-slate-100 border border-slate-200 rounded-lg p-0.5">
                <button onClick={() => setLanguage('es')} aria-pressed={language === 'es'} className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${language === 'es' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600 hover:text-slate-800'}`} title="Español">ES</button>
                <button onClick={() => setLanguage('en')} aria-pressed={language === 'en'} className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${language === 'en' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600 hover:text-slate-800'}`} title="English">EN</button>
              </div>
            </>}

            {/* Toggle de tema de la suite — siempre visible */}
            <ThemeToggle lang={language} />

            {/* REPORTAR UN PROBLEMA. Primero fue un ícono suelto en gris claro y
                el profesor no lo encontraba: «para web es casi imperceptible».
                Tenía razón. Un ícono sin etiqueta solo funciona cuando el gesto
                ya es conocido (el engranaje de ajustes), y este no lo es.
                Ahora es un botón con borde y con TEXTO desde `sm`: en el móvil
                el espacio de la cabecera manda y se queda el ícono, pero en un
                escritorio hay sitio de sobra y esconderlo no ahorra nada.
                El ícono es el del aviso a propósito: es el mismo que el alumno
                acaba de ver en pantalla cuando algo salió mal. */}
            {hayQueReportar && <button
              onClick={() => { setReporte(construirReporte()); setReporteCopiado(false); }}
              title={t.reportar}
              aria-label={t.reportar}
              /* Hover NEUTRO, no ámbar. El ámbar chocaba en los dos temas: el
                 600 daba 3,07:1 sobre `bg-amber-50` en claro y el 700 daba
                 3,15:1 en oscuro, porque la capa oscura invierte el fondo y
                 deja la tinta donde estaba. */
              /* En ÁMBAR y no en gris. Con la misma piel que el botón de tema
                 se perdía entre los controles de la cabecera, que era la queja:
                 «la idea era que el ícono resalte más». El ámbar es el color
                 que la app ya usa para los avisos, así que no estrena
                 significado: dice «algo va mal» en el mismo idioma que el resto. */
              /* `text-amber-700` y NO el 800: la capa oscura tiene una regla
                 para el par `bg-amber-50 + text-amber-700` (la aclara a #fde68a,
                 12,25:1) y el 800 se queda fuera, oscuro sobre oscuro a 2,15:1.
                 En claro el 700 da 4,84 sobre el -50 y 4,51 sobre el -100. */
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-bold bg-amber-50 border border-amber-400 text-amber-700 hover:bg-amber-100 transition-all"
            >
              <AlertTriangle className="w-[1.15rem] h-[1.15rem] shrink-0" />
              <span className="hidden sm:inline whitespace-nowrap">{t.reportarCorto}</span>
            </button>}

          </div>
        </header>
      )}

      {/* REPORTAR, EMBEBIDO. La cabecera se fue, pero este botón no podía irse
          con ella: sale solo cuando hay algo delante que reportar, y eso lo
          sabe esta app y no el hub. Para subirlo a la barra de allá habría que
          avisarle por `postMessage` cada vez que ese estado cambia y devolverle
          el clic para abrir el diálogo de acá — mensajería en los dos sentidos,
          y por triplicado, para un botón.
          Así que se queda de este lado, pero FUERA de una cabecera: sin borde,
          sin fondo y sin barra. Cuando no hay nada que reportar no ocupa ni un
          píxel, que es casi siempre; y cuando lo hay, aparece donde estaba. */}
      {fromHub && hayQueReportar && (
        <div className="flex-shrink-0 px-4 pt-3 flex justify-end">
          <button
            onClick={() => { setReporte(construirReporte()); setReporteCopiado(false); }}
            title={t.reportar}
            aria-label={t.reportar}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-bold bg-amber-50 border border-amber-400 text-amber-700 hover:bg-amber-100 transition-all"
          >
            <AlertTriangle className="w-[1.15rem] h-[1.15rem] shrink-0" />
            <span className="hidden sm:inline whitespace-nowrap">{t.reportarCorto}</span>
          </button>
        </div>
      )}

        {/* Constructor (modo por defecto) — solo cuando no hay sección activa */}
        {!activePanel && (
        <main className="flex-1 overflow-y-auto py-4 px-4 sm:px-8 pb-24 sm:pb-6">
        <div className="max-w-5xl mx-auto space-y-4">

        {/* Formulario Principal */}
        <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6 space-y-4 sm:space-y-6">

          {/* TIEMPO VERBAL */}
          <div className="pb-4 border-b border-gray-100">
            <div className="flex flex-wrap items-center gap-2">

              {/* Un solo rótulo para una sola decisión. Antes cambiaba de nombre
                  según hubiera condicional o no, porque abajo cambiaba el
                  control entero; ahora el control es siempre el mismo. */}
              <label className={`text-xs font-semibold tracking-wide uppercase shrink-0 ${
                !selectedTense && !selectedModal && !esCondicional ? 'text-indigo-600' : 'text-muted'}`}>
                {language === 'es' ? 'Tiempo, modal o condicional' : 'Tense, modal or conditional'} <span className="text-red-600">*</span>
              </label>
              {/* Los tres son excluyentes: elegir uno limpia los otros dos.
                  La condicional sigue sin pasar por la rampa de tiempos —el tipo
                  fija los dos—, pero eso ya no exige un control aparte: basta con
                  que sea otra opción de este mismo selector. */}
              <TensePicker
                value={selectedTense}
                modalValue={selectedModal}
                condValue={tipoCond}
                onSelectTense={(id) => { setSelectedTense(id); setSelectedModal(''); setTipoCond(null); }}
                onSelectModal={(id) => { setSelectedModal(id); setSelectedTense(''); setTipoCond(null); }}
                onSelectCond={(n) => { setTipoCond(n); setSelectedTense(''); setSelectedModal(''); }}
                condLabels={{ 1: t.condTipo1, 2: t.condTipo2, 3: t.condTipo3 }}
                condLabel={t.condicional}
                condHelp={t.condicionalAyuda}
                language={language}
                cefrLevel={cefrLevel}
                highlight={!selectedTense && !selectedModal && !esCondicional}
              />

              <div className="hidden sm:block w-px h-5 bg-gray-200 shrink-0" />

              <div className="flex w-full sm:w-auto sm:ml-auto items-center gap-2">
                {/* El modo activo se marca con la cápsula NEUTRA, no con un tono
                    propio: el color vive en el signo. Con var(--f-cap) el estado
                    activo ya es consciente del tema y no necesita capa `dark:`. */}
                <div className="flex flex-1 sm:flex-none rounded-lg border border-gray-200 overflow-hidden shrink-0">
                  {modes.map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setSelectedMode(mode.id)}
                      aria-pressed={selectedMode === mode.id}
                      className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all border-r last:border-r-0 border-gray-200 ${
                        selectedMode === mode.id
                          ? 'bg-[var(--f-cap)] text-[var(--f-cap-ink)] shadow-inner font-semibold'
                          : 'bg-white text-muted hover:bg-gray-50'
                      }`}
                    >
                      {/* Sin `opacity` en el inactivo: atenuar el signo lo dejaba
                          en 2,87:1 sobre blanco (ni el 3:1 de gráfico), y además
                          el color del signo ES el distintivo. Lo activo ya se
                          distingue por la cápsula y el peso de la tipografía. */}
                      <FormSign form={mode.id} className="text-sm leading-none shrink-0" />
                      <span className="hidden sm:inline">
                        {mode.id === 'affirmative' ? t.affirmative : mode.id === 'negative' ? t.negative : t.interrogative}
                      </span>
                      <span className="sm:hidden">
                        {mode.id === 'affirmative' ? (language === 'es' ? 'Afirm.' : 'Affirm.')
                          : mode.id === 'negative' ? (language === 'es' ? 'Neg.' : 'Neg.')
                          : (language === 'es' ? 'Inter.' : 'Inter.')}
                      </span>
                    </button>
                  ))}
                </div>

                {/* CONTRACCIÓN. Solo en la negativa, que es donde significa
                    algo: en afirmativa e interrogativa no hay nada que
                    contraer, y un control que no hace nada es ruido.
                    Aquí y no en la cabecera a propósito: aparece pegado a la
                    forma que modifica, y la cabecera ya está cargada. */}
                {selectedMode === 'negative' && (
                  <button
                    onClick={() => setContraer(!contraer)}
                    aria-pressed={!contraer}
                    title={contraer ? t.contraerVer : t.contraerVolver}
                    className="shrink-0 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all whitespace-nowrap"
                  >
                    {contraer ? "isn't" : 'is not'}
                  </button>
                )}

                <button
                  onClick={resetForm}
                  title={language === 'es' ? 'Limpiar todo' : 'Clear all'}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 hover:text-red-700 hover:bg-red-50 rounded-lg border border-gray-200 hover:border-red-200 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {selectedTense && !selectedModal && (() => {
              const tenseData = tenses.find(t => t.id === selectedTense);
              const formula = TENSE_FORMULAS[selectedTense];
              if (!tenseData || !formula) return null;
              const modeKey = selectedMode === 'affirmative' ? 'aff' : selectedMode === 'negative' ? 'neg' : 'int';

              /* La fórmula CRECE cuando el alumno elige adverbio, y solo entonces.
                 Sin adverbio se ve la estructura básica de tres piezas, que es lo
                 que se quiere enseñar; al elegir uno, la fórmula muestra dónde
                 cae. Así el cuarto elemento deja de aparecer en la oración sin
                 haber sido anunciado — antes la fórmula prometía S+V+C y salían
                 cuatro cosas de colores.

                 Va SIEMPRE justo antes del término V, y eso no es una regla
                 nueva: es la que ya aplica el generador. Sus tres casos
                 —«Sujeto + Adverbio + Verbo» sin auxiliar, «Sujeto + Auxiliar +
                 Adverbio + Verbo» con él, y tras el sujeto en interrogativo—
                 colapsan todos en «antes de V» sobre estas fórmulas. Si algún día
                 cambia el orden allá, esto tiene que cambiar aquí o la fórmula
                 pasa a enseñar algo falso. */
              const advSel = selectedAdverb
                ? frequencyAdverbs.find(a => a.id === selectedAdverb)
                : null;
              const conAdverbio = (f) => {
                if (!advSel) return f;
                const partes = f.split(' + ');
                const iV = partes.findIndex(p => /^V\b|^V\(/.test(p));
                if (iV === -1) return f;                       // sin término V: no se toca
                partes.splice(iV, 0, advSel.name.toLowerCase());
                return partes.join(' + ');
              };

              return (
                <div className="mt-2 p-2.5 bg-indigo-50 border border-indigo-100 rounded-lg">
                  <div className="flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-mono font-semibold text-indigo-700 text-xs tracking-wide">{conAdverbio(formula[modeKey])}</div>
                      {/* Un paso MÁS oscuro que el gris secundario de la app, y no
                          por capricho: estos dos van sobre el tinte índigo del
                          recuadro, no sobre blanco, así que el mismo gris que
                          pasa en la tarjeta se queda corto aquí (4,32:1). Con
                          gray-600 son 6,76:1. */}
                      <div className="text-gray-600 text-xs mt-0.5">{language === 'es' ? tenseData.descEs : tenseData.descEn}</div>
                      <div className="text-gray-600 text-xs italic mt-0.5">{language === 'es' ? 'Ej.: ' : 'Ex.: '}{tenseData.example}</div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* WH Questions */}
          {selectedMode === 'interrogative' && (
            <div className="space-y-2">
              {/* Fila de chips base */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-muted uppercase tracking-wide shrink-0 w-6">WH</span>
                {whDisponibles.map(wh => {
                  const pide = whAsks[wh.id];
                  const elegida = whWord === wh.id;
                  return (
                    <button
                      key={wh.id}
                      type="button"
                      aria-pressed={elegida}
                      // En escritorio el dato aparece al pasar el mouse; en
                      // móvil, al elegir la wh (la línea de abajo).
                      title={pide ? `${wh.name} → ${language === 'es' ? pide.es : pide.en}` : undefined}
                      // Con la pregunta de sujeto activa no se puede quedar sin wh: ES el sujeto.
                      onClick={() => { if (!(elegida && esPregSujeto)) { setWhWord(elegida ? '' : wh.id); setWhExtension(''); } }}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                        elegida
                          ? 'bg-teal-700 text-white border-teal-700'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-teal-400 hover:text-teal-700'
                      }`}
                    >
                      {wh.name}
                    </button>
                  );
                })}
              </div>
              {/* La pregunta de sujeto, en el sitio del que habla: la wh-word.
                  Solo se ofrece cuando ya hay una wh que PUEDE ejecutar la
                  acción, así que el orden es el natural — primero eliges «who»,
                  después la app te pregunta si ese «who» es quien la hace. Y
                  tiene que preguntarlo: «Who called you?» y «Who did you call?»
                  usan la misma palabra, así que no se puede deducir. */}
              {puedeSerPregSujeto && (
                <div className="pl-8">
                  <label className={`inline-flex items-start gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-all ${
                    esPregSujeto ? 'border-teal-500 bg-teal-50 text-teal-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}>
                    <input
                      type="checkbox"
                      checked={esPregSujeto}
                      onChange={(e) => setWhEsSujeto(e.target.checked)}
                      className="mt-0.5 accent-teal-600"
                    />
                    <span className="min-w-0">
                      <span className="font-semibold">{t.subjectQuestion}</span>
                      <span className="block text-[11px] leading-tight opacity-90">{t.subjectQuestionHelp}</span>
                    </span>
                  </label>
                </div>
              )}
              {/* Qué dato pide la wh elegida. La compuesta manda sobre la base:
                  «how many» pide una cantidad, no «una manera». */}
              {whWord && (() => {
                const nombre = whWords.find(w => w.id === whWord)?.name || whWord;
                const clave = `${whWord} ${whExtension.trim()}`.trim().toLowerCase().replace(/\s+of$/, '');
                const pide = whAsks[clave] || whAsks[whWord];
                if (!pide) return null;
                return (
                  <p className="pl-8 text-xs text-muted">
                    <span className="font-semibold text-teal-700">{nombre}{whExtension.trim() ? ' ' + whExtension.trim() : ''}</span>
                    {' '}{language === 'es' ? 'pide' : 'asks for'}{' '}
                    <span className="font-medium text-gray-700">{language === 'es' ? pide.es : pide.en}</span>
                  </p>
                );
              })()}
              {/* Extensión: solo para WH compuestas (What, Which, How) */}
              {whWord && whSuggestions[whWord] && (
                <div className="flex flex-wrap items-center gap-1.5 pl-8">
                  {whSuggestions[whWord].map(ext => (
                    <button
                      key={ext}
                      type="button"
                      onClick={() => setWhExtension(whExtension === ext ? '' : ext)}
                      className={`px-2.5 py-0.5 rounded-full text-xs border transition-all ${
                        whExtension === ext
                          ? 'bg-teal-100 text-teal-800 border-teal-400 font-medium'
                          : 'bg-white text-muted border-gray-200 hover:border-teal-300 hover:text-teal-700'
                      }`}
                    >
                      {whWords.find(w => w.id === whWord)?.name} {ext}
                      {/\bof$/i.test(ext) && <span className="opacity-50"> …</span>}
                    </button>
                  ))}
                  <input
                    type="text"
                    value={whExtension}
                    onChange={(e) => setWhExtension(e.target.value)}
                    placeholder={language === 'es' ? 'o escribe otra…' : 'or type another…'}
                    className="flex-1 min-w-32 px-3 py-1 text-xs border border-gray-200 rounded-full focus:outline-none focus:ring-1 focus:ring-teal-400 focus:border-teal-400 placeholder-gray-400"
                  />
                </div>
              )}
              {/* Extensión a medias: se explica en vez de armar inglés roto */}
              {whWord && whExtIncompleta && (
                <p className="pl-8 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                  {language === 'es'
                    ? <>«<b>{whWords.find(w => w.id === whWord)?.name} {whExtension.trim()}</b>» necesita un sustantivo detrás: <b>{whWords.find(w => w.id === whWord)?.name} {whExtension.trim()} music…</b> Escríbelo arriba; mientras tanto la oración se arma sin la extensión.</>
                    : <>“<b>{whWords.find(w => w.id === whWord)?.name} {whExtension.trim()}</b>” needs a noun after it: <b>{whWords.find(w => w.id === whWord)?.name} {whExtension.trim()} music…</b> Type it above; meanwhile the sentence is built without the extension.</>}
                </p>
              )}
            </div>
          )}

          {/* Campos principales */}
          <div className={`grid grid-cols-1 gap-4 ${(selectedTense === 'simple-present' || selectedTense === 'simple-past') && !selectedModal ? 'md:grid-cols-[2fr_1.5fr_2fr_2.5fr]' : 'md:grid-cols-[2fr_2fr_3fr]'}`}>
            {/* Sujeto — en la pregunta de sujeto lo ocupa la wh, así que el
                campo se apaga en vez de desaparecer: que se vea QUÉ casilla
                está llenando la wh-word es justamente la lección. */}
            {/* CONDICIÓN — solo con la condicional activa. Va arriba porque es
                la que abre la oración, y lleva su propio negador: negar la
                condición no es lo mismo que negar el resultado. */}
            {esCondicional && (
              <div className="md:col-span-full rounded-xl border border-pink-200 bg-pink-50 p-3">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-pink-100 text-pink-900">IF</span>
                  <span className="text-sm font-medium text-pink-900">{t.condCondicion}</span>
                  <button
                    onClick={() => setCondNeg(v => !v)}
                    aria-pressed={condNeg}
                    title={t.condNegarAyuda}
                    className={`ml-auto flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition-all ${
                      condNeg ? 'border-rose-500 bg-rose-100 text-rose-800' : 'border-pink-200 bg-white text-pink-900 hover:bg-pink-100'
                    }`}
                  >
                    <XCircle className="w-3 h-3 shrink-0" />
                    {t.condNegarCondicion}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input type="text" value={condSubject} onChange={(e) => setCondSubject(e.target.value)}
                    autoCapitalize="none" placeholder={t.subject}
                    className="w-full px-3 py-2 border border-pink-200 rounded-lg text-sm bg-white" />
                  <input type="text" value={condVerb} onChange={(e) => setCondVerb(e.target.value)}
                    autoCapitalize="none" placeholder={t.verb}
                    className="w-full px-3 py-2 border border-pink-200 rounded-lg text-sm bg-white" />
                  <input type="text" value={condComplement} onChange={(e) => setCondComplement(e.target.value)}
                    autoCapitalize="none" placeholder={t.complement}
                    className="w-full px-3 py-2 border border-pink-200 rounded-lg text-sm bg-white" />
                </div>
                {/* El `were` del subjuntivo se avisa, no se corrige a escondidas. */}
                {tipoCond === 2 && condVerb.trim().toLowerCase() === 'be' && (
                  <p className="mt-2 text-[11px] text-pink-900">{t.condWereNota}</p>
                )}
              </div>
            )}
            {/* Sin este rótulo los campos de abajo se leen como «los campos de
                siempre» y no como la otra mitad del par. */}
            {esCondicional && (
              <div className="md:col-span-full -mb-2 flex items-center gap-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-pink-100 text-pink-900">⇒</span>
                <span className="text-sm font-medium text-pink-900">{t.condResultado}</span>
              </div>
            )}

            <div>
              <label className="flex items-center gap-1.5 mb-1.5">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${esPregSujeto ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-blue-700'}`}>
                  S</span>
                <span className={`text-sm font-medium ${esPregSujeto ? 'text-teal-700' : 'text-blue-600'}`}>{t.subject}</span>
                {!esPregSujeto && <span className="text-red-600 text-xs">*</span>}
              </label>
              {esPregSujeto ? (
                <div className="w-full px-4 py-2.5 border-y border-r rounded-lg border-l-4 border-teal-300 border-l-teal-600 bg-teal-50 text-teal-800 text-sm flex items-center gap-2">
                  <UserCircle className="w-4 h-4 shrink-0" />
                  <span className="font-semibold">{whWords.find(w => w.id === whWord)?.name || 'Who'}{whExtUsable ? ' ' + whExtUsable : ''}</span>
                  <span className="text-teal-700 text-xs">· {t.subjectNotNeeded}</span>
                </div>
              ) : (
              <input
                ref={subjectRef}
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onKeyDown={(e) => advanceOnEnter(e, verbRef)}
                /* El teclado móvil capitaliza la primera letra de cada campo y
                   eso llega a la oración final. Se apaga aquí (el alumno decide
                   cuándo va mayúscula) y smartCase lo corrige al generar. */
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                placeholder="I, you, he, she, we..."
                className={`w-full px-4 py-2.5 border-y border-r rounded-lg border-l-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${
                  !subjectValidation.valid ? 'border-red-400 bg-red-50' :
                  subjectValidation.warning ? 'border-amber-600 bg-amber-50 border-l-amber-600' :
                  'border-gray-300 border-l-blue-500 focus:border-indigo-500'
                }`}
              />
              )}
              {!esPregSujeto && !subjectValidation.valid && subjectValidation.warning && (
                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {subjectValidation.warning}
                </p>
              )}
              {subjectValidation.valid && subjectValidation.warning && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {subjectValidation.warning}
                </p>
              )}
              {/* AMBIGÜEDAD DE LA -s. La app no puede saber si «Jans» es un
                  nombre o un plural, así que lo dice en vez de elegir en
                  silencio. Es además una verdad que vale la pena enseñar: esa
                  -s final es ambigua. Se pregunta una vez por nombre. */}
              {!esPregSujeto && sujetoAmbiguo && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1 flex-wrap">
                  <AlertTriangle className="w-3 h-3" />
                  {t.nombreODuda.replace('{palabra}', sujetoAmbiguo)}
                  <button
                    onClick={() => agregarNombre(sujetoAmbiguo)}
                    className="underline font-semibold text-amber-700"
                  >{t.nombreSi}</button>
                </p>
              )}
              {spellingErrors.subject.length > 0 && subjectValidation.valid && !subjectValidation.warning && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {t.didYouMean}:
                  {spellingErrors.subject[0].suggestions.slice(0, 2).map((s, i) => (
                    <button key={i} onClick={() => applySuggestion('subject', spellingErrors.subject[0].word, s)} className="underline font-medium ml-1">{s}</button>
                  ))}
                </p>
              )}
              <AvisoMayuscula campo="subject" />
            </div>

            {/* Adverbio de frecuencia - solo para Simple Present y Simple Past */}
            {(selectedTense === 'simple-present' || selectedTense === 'simple-past') && !selectedModal && (
              <div>
                {/* Insignia A, como S/V/C. Era el ÚNICO campo sin ella, y esa
                    ausencia lo dejaba en tierra de nadie: ni parecía parte de la
                    estructura ni se entendía por qué estaba ahí. El adverbio de
                    frecuencia SÍ es contenido del temario y tiene regla de
                    posición propia, así que se declara igual que los demás y la
                    fórmula de arriba muestra dónde cae cuando se elige.
                    El ámbar es `roles.adverb`, el mismo con el que se pinta luego
                    en la oración. */}
                <label className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">A</span>
                  <span className="text-sm font-medium text-amber-700">{t.adverbLabel}</span>
                  <span className="text-muted text-xs">({t.optional})</span>
                </label>
                <select
                  value={selectedAdverb}
                  onChange={(e) => setSelectedAdverb(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white"
                >
                  {frequencyAdverbs
                    .filter((adv) => selectedMode !== 'negative' || !NEGATIVE_SENSE_ADVERBS.includes(adv.id))
                    .map((adv) => (
                    <option key={adv.id} value={adv.id}>
                      {adv.id ? adv.name : (language === 'es' ? adv.descEs : adv.descEn)}{adv.id && (language === 'es' ? ` - ${adv.descEs}` : ` (${adv.percentage}%)`)}
                    </option>
                  ))}
                </select>
                {selectedAdverb && (
                  <p className="text-xs text-indigo-600 mt-1">
                    {t.frequencyAdverbHint}
                  </p>
                )}
              </div>
            )}

            {/* Verbo */}
            <div className="relative">
              <label className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded">V</span>
                <span className="text-sm font-medium text-red-700">{t.verb}</span>
                <span className="text-red-600 text-xs">*</span>
                {/* Antes solo se decía cuando la app YA había detectado una forma
                    conjugada, o sea después del error. Dicho desde el principio,
                    el error no llega a ocurrir. */}
                <span className="text-muted text-xs">({t.verbBaseHint})</span>
              </label>
              <input
                ref={verbRef}
                type="text"
                value={verb}
                onChange={(e) => { setVerb(e.target.value); setShowVerbSuggestions(e.target.value.length > 0); }}
                onFocus={() => setShowVerbSuggestions(verb.length > 0)}
                onBlur={() => setTimeout(() => setShowVerbSuggestions(false), 200)}
                /* Enter cierra las sugerencias y salta al complemento; Escape
                   solo las cierra, para poder seguir editando el verbo. */
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setShowVerbSuggestions(false); return; }
                  advanceOnEnter(e, complementRef);
                }}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                placeholder="work, study, play..."
                className={`w-full px-4 py-2.5 border-y border-r rounded-lg border-l-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${
                  verbBaseSuggestion || !verbValidation.valid ? 'border-red-400 bg-red-50' :
                  verbValidation.warning ? 'border-amber-600 bg-amber-50 border-l-amber-600' :
                  'border-gray-300 border-l-red-500 focus:border-indigo-500'
                }`}
              />
              {showVerbSuggestions && verbSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {verbSuggestions.slice(0, 6).map((v) => (
                    <button key={v} onClick={() => { setVerb(v); setShowVerbSuggestions(false); }} className="w-full text-left px-4 py-2 hover:bg-indigo-50 text-sm">{v}</button>
                  ))}
                </div>
              )}
              {/* El verbo escribido ya está conjugado (worked, working, works…):
                  se prioriza esta sugerencia sobre los avisos genéricos de validación,
                  porque ya explica el problema y ofrece el arreglo con un click. */}
              {verbBaseSuggestion ? (
                <p className="text-xs text-red-600 mt-1 flex items-center gap-1.5 flex-wrap">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  {t.verbBaseForm}
                  <button
                    type="button"
                    onClick={() => setVerb(verbBaseSuggestion)}
                    className="underline font-semibold text-red-700 hover:text-red-800"
                  >
                    {language === 'es' ? `Usar "${verbBaseSuggestion}"` : `Use "${verbBaseSuggestion}"`}
                  </button>
                </p>
              ) : (
                <>
                  {!verbValidation.valid && verbValidation.warning && (
                    <p className="text-xs text-red-600 mt-1 flex items-center gap-1 flex-wrap">
                      <AlertTriangle className="w-3 h-3 shrink-0" /> {verbValidation.warning}
                      {/* Arreglo a un clic. Con `alComplemento` la palabra que
                          sobra no se tira: se MUEVE a su casilla, que es lo que
                          enseña dónde iba. Si el complemento ya tiene algo, se
                          antepone en vez de pisarlo — borrar lo que el alumno
                          escribió para «ayudarle» es el peor arreglo posible. */}
                      {verbValidation.arreglo && (
                        <button
                          onClick={() => {
                            if (verbValidation.alComplemento) {
                              setComplement(prev => prev.trim()
                                ? `${verbValidation.alComplemento} ${prev.trim()}`
                                : verbValidation.alComplemento);
                            }
                            setVerb(verbValidation.arreglo);
                          }}
                          className="underline font-semibold"
                        >{verbValidation.alComplemento ? t.moverAlComplemento : t.dejarSolo} </button>
                      )}
                    </p>
                  )}
                  {verbValidation.valid && verbValidation.warning && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {verbValidation.warning}
                    </p>
                  )}
                </>
              )}
              {isIrregular && irregularVerbs[verb.toLowerCase()] && verbValidation.valid && !verbValidation.warning && (
                <p className="text-xs text-emerald-600 mt-1">
                  <CheckCircle className="w-3 h-3 inline mr-1" />
                  {t.irregularDetected}: {irregularVerbs[verb.toLowerCase()].past}/{irregularVerbs[verb.toLowerCase()].participle}
                </p>
              )}
              <AvisoMayuscula campo="verb" />
            </div>

            {/* Complemento */}
            <div>
              <label className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">C</span>
                <span className="text-sm font-medium text-slate-600">{t.complement}</span>
                <span className="text-muted text-xs">({t.optional})</span>
              </label>
              <input
                ref={complementRef}
                type="text"
                value={complement}
                onChange={(e) => setComplement(e.target.value)}
                /* Último campo: Enter genera la oración directamente. */
                onKeyDown={(e) => advanceOnEnter(e, null)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                placeholder="yesterday, at home..."
                className={`w-full px-4 py-2.5 border-y border-r rounded-lg border-l-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${
                  !complementValidation.valid ? 'border-red-400 bg-red-50' :
                  complementValidation.warning ? 'border-amber-600 bg-amber-50 border-l-amber-600' :
                  'border-gray-300 border-l-slate-500 focus:border-indigo-500'
                }`}
              />
              {!complementValidation.valid && complementValidation.warning && (
                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {complementValidation.warning}
                </p>
              )}
              {complementValidation.valid && complementValidation.warning && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1 flex-wrap">
                  <AlertTriangle className="w-3 h-3" /> {complementValidation.warning}
                  {/* Con el arreglo a un clic: en clase, delante del curso, no
                      hay tiempo de volver al campo y reescribirlo. */}
                  {complementValidation.arreglo && (
                    <button
                      onClick={() => setComplement(complementValidation.arreglo)}
                      className="underline font-semibold text-amber-700"
                    >{t.aplicar}</button>
                  )}
                </p>
              )}
              <AvisoMayuscula campo="complement" />
              {selectedTense && COMPLEMENT_CHIPS[selectedTense] && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {COMPLEMENT_CHIPS[selectedTense].map(chip => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setComplement(chip)}
                      className={`px-2 py-0.5 rounded-full text-xs border transition-all ${
                        complement === chip
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-muted border-gray-300 hover:border-emerald-400 hover:text-emerald-700'
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Botón Generar. Con el verbo dudoso se pone ámbar y dice POR QUÉ:
              el motivo va aquí, pegado al botón que el alumno está tocando, y no
              solo bajo el campo —que es donde nadie lo leía—. `role="alert"` para
              que un lector de pantalla también lo anuncie al armarse. */}
          {avisoVerbo && (
            <p role="alert" className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {/* Con la condicional activa hay DOS verbos, así que cada aviso
                    dice de cuál habla; sin ella sobra el rótulo. */}
                {revisionCondVerbo.confirmar && (
                  <>{esCondicional && <b>{t.condCondicion}: </b>}
                    {revisionCondVerbo.tipo === 'conjugado' ? t.verbBaseForm : revisionCondVerbo.aviso}{' '}</>
                )}
                {revisionVerbo.confirmar && (
                  <>{esCondicional && <b>{t.condResultado}: </b>}
                    {revisionVerbo.tipo === 'conjugado' ? t.verbBaseForm : verbValidation.warning}{' '}</>
                )}
                {t.verbConfirmHint}
              </span>
            </p>
          )}
          <button
            onClick={generateSentence}
            className={`w-full py-3 text-white rounded-xl font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-2 ${
              avisoVerbo ? 'bg-amber-700 hover:bg-amber-800' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {avisoVerbo ? <AlertTriangle className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            {avisoVerbo ? t.generateAnyway : t.generate}
          </button>
        </div>

        {/* Generated Sentence con Análisis Visual */}
        {generatedSentence && (
          <div ref={sentenceRef} className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6 mt-4 sm:mt-6 scroll-mt-4">
            {/* Encabezado del resultado */}
            <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-semibold text-gray-600">{language === 'es' ? 'Oración generada' : 'Generated sentence'}</span>
              </div>
              {/* Leyenda de colores — solo las partes presentes en la oración */}
              {sentenceAnalysis && (
                <div className="flex items-center gap-1.5 text-xs text-muted shrink-0">
                  {sentenceAnalysis.parts.some(p => p.type === 'wh-word' || p.type === 'wh-subject') && (
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-600 inline-block"></span>WH</span>
                  )}
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-600 inline-block"></span>S</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-600 inline-block"></span>V</span>
                  {sentenceAnalysis.parts.some(p => p.type === 'complement') && (
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>C</span>
                  )}
                  {/* Una sola entrada A para los DOS: el adverbio de frecuencia
                      («always») y el complemento adverbial («at home»). No es un
                      atajo — son la misma categoría funcional, adjuntos los dos,
                      y darles entradas separadas diría que son cosas distintas.
                      Antes «always» no figuraba en la leyenda en absoluto, así que
                      salía coloreado sin que nada lo declarara. */}
                  {sentenceAnalysis.parts.some(p => p.type === 'adverbial' || p.type === 'adverb') && (
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>A</span>
                  )}
                </div>
              )}
            </div>
            {/* Aviso de interactividad: cómo descubrir el desglose por palabra */}
            {sentenceAnalysis && (
              <p className="text-xs text-muted mb-3 flex items-center gap-1">
                💡 {language === 'es'
                  ? 'Toca o pasa el mouse sobre cada palabra para ver su función en la oración.'
                  : 'Tap or hover each word to see its role in the sentence.'}
              </p>
            )}
            {/* Oración con colores */}
            {sentenceAnalysis ? (
              <div className="mb-4">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xl sm:text-2xl md:text-3xl font-bold font-['Atkinson_Hyperlegible']">
                  {sentenceAnalysis.parts.map((part, index) => {
                    const partLabel =
                      part.type === 'conditional-if' ? (language === 'es' ? 'Conector · condición' : 'Connector · condition') :
                      part.type === 'wh-subject' ? (language === 'es' ? 'WH = sujeto' : 'WH = subject') :
                      part.type === 'wh-word' ? (language === 'es' ? 'Palabra WH' : 'WH Word') :
                      part.type === 'subject' ? t.subjectLabel :
                      part.type === 'adverb' ? t.adverbLabel :
                      part.type === 'auxiliary' ? t.auxiliaryLabel :
                      part.type === 'verb' ? t.verbLabel :
                      part.type === 'adverbial' ? (language === 'es' ? 'Adverbial (A)' : 'Adverbial (A)') :
                      t.complementLabel + ' (C)';
                    const colorClasses =
                      part.type === 'conditional-if' ? 'text-pink-700 hover:bg-pink-100' :
                      part.type === 'wh-subject' ? ROLE_TW['wh-word'] :
                      part.type === 'wh-word' ? ROLE_TW['wh-word'] :
                      part.type === 'subject' ? ROLE_TW.subject :
                      /* Sale del rol y ya no a pelo. Estaba en `text-indigo-500`,
                         a una parada del modal (`text-indigo-600`): la app pintaba
                         «always» con el tono de otro rol, y de uno que sí figura
                         en la leyenda. `roles.adverb` ya existía en design-tokens
                         y las otras dos apps lo usaban; solo faltaba traerlo. */
                      part.type === 'adverb' ? ROLE_TW.adverb :
                      part.type === 'auxiliary' ? ROLE_TW.auxiliary :
                      part.type === 'verb' ? ROLE_TW.verb :
                      part.type === 'complement' ? ROLE_TW.complement :
                      part.type === 'adverbial' ? 'text-amber-600 hover:bg-amber-50' :
                      'text-gray-800';

                    // La puntuación no lleva explicación — se muestra como texto simple
                    if (part.type === 'punctuation') {
                      return <span key={index} className="text-muted px-1">{txt(part.text)}</span>;
                    }

                    const isPinned = selectedPartIndex === index;
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setSelectedPartIndex(prev => prev === index ? null : index)}
                        onFocus={() => setSelectedPartIndex(index)}
                        onMouseEnter={() => setSelectedPartIndex(index)}
                        aria-describedby={`part-desc-${index}`}
                        aria-expanded={isPinned}
                        className={`relative group appearance-none bg-transparent border-0 cursor-pointer transition-all duration-200 ${colorClasses} px-1 rounded ${isPinned ? 'ring-2 ring-offset-1 ring-indigo-300' : ''}`}
                      >
                        {txt(part.text)}
                        {/* La explicación se muestra en un panel único bajo la oración (evita el recorte en los bordes de la pantalla) */}
                        <span id={`part-desc-${index}`} className="sr-only">
                          {partLabel}. {part.explanation}
                          {part.transformation ? `. ${part.transformation}` : ''}
                          {part.isNew ? `. ${t.addedElement}` : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {selectedPartIndex != null && sentenceAnalysis.parts[selectedPartIndex] && sentenceAnalysis.parts[selectedPartIndex].type !== 'punctuation' && (() => {
                  const part = sentenceAnalysis.parts[selectedPartIndex];
                  const label = part.type === 'wh-subject' ? (language === 'es' ? 'WH = sujeto' : 'WH = subject')
                    : part.type === 'wh-word' ? (language === 'es' ? 'Palabra WH' : 'WH Word')
                    : part.type === 'subject' ? t.subjectLabel
                    : part.type === 'adverb' ? t.adverbLabel
                    : part.type === 'auxiliary' ? t.auxiliaryLabel
                    : part.type === 'verb' ? t.verbLabel
                    : part.type === 'adverbial' ? 'Adverbial (A)'
                    : t.complementLabel + ' (C)';
                  return (
                    <div className="mt-3 px-3.5 py-2.5 bg-gray-900 text-white text-sm rounded-lg shadow-lg motion-safe:animate-[gtoastIn_.25s_ease]">
                      <span className="font-bold block mb-0.5">{label}</span>
                      <span className="text-gray-100">{part.explanation}</span>
                      {part.transformation && <span className="block mt-1 text-green-300">{part.transformation}</span>}
                      {part.isNew && <span className="block mt-1 text-purple-300">{t.addedElement}</span>}
                    </div>
                  );
                })()}

              </div>
            ) : (
              <p className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 mb-4">{txt(generatedSentence)}</p>
            )}

            {/* Botones de acción */}
            <div className="space-y-2">
              {/* Fila principal: Copiar + Escuchar + velocidad */}
              {/* Los tres vestían distinto sin que la diferencia significara nada.
                  «Copiar» era `bg-gray-100`, que la capa de oscuro sí convierte;
                  «Escuchar» era `bg-indigo-100`, que a propósito NO se convierte
                  (ver la nota de los tintes -100 en index.css). Resultado: en
                  oscuro, un botón oscuro al lado de una pastilla clara que ADEMÁS
                  se invertía a oscura al pasar el mouse, porque el hover sí está
                  cubierto. No era jerarquía, era media conversión.

                  Ahora los tres comparten la familia `--f-cap`, la misma del
                  control de los 3 modos y de las cápsulas del panel: un solo
                  lenguaje visual para todo el resultado, y sin depender de que
                  alguien acierte con el override.

                  Los estados (copiado / hablando) se marcan con RELLENO, no con
                  tono: `--state-fill` sobre `--state-ink`, que salen de la
                  sección `states` de design-tokens.

                  El tono se descartó midiendo, no por gusto. Todos los hues del
                  sistema están tomados, y el que pediría el instinto para
                  «copiado» —verde— es el de la forma AFIRMATIVA, que vive en
                  este mismo panel a dos centímetros: un botón verde encima de un
                  «+» verde se lee como si tuvieran que ver. Reusar un tono solo
                  es seguro cuando las dos cosas no comparten unidad de UI, y aquí
                  la comparten. El relleno, en cambio, estaba libre: ningún
                  elemento gramatical del panel se rellena, todos son cápsulas con
                  borde. Ver `states.$porQueNoEstrenaTono` en tokens.json.

                  Un solo estado para los dos botones a propósito: el icono y el
                  texto ya los distinguen, y son excluyentes dentro de un mismo
                  control. */}
              <div className="flex gap-2">
                <button
                  onClick={() => copyToClipboard(generatedSentence)}
                  className={`flex-1 px-3 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold transition border ${
                    copied
                      ? 'bg-[var(--state-fill)] border-[var(--state-fill)] text-[var(--state-ink)]'
                      : 'bg-[var(--f-cap)] border-[var(--f-cap-border)] text-[var(--f-cap-ink)] hover:brightness-95 dark:hover:brightness-110'
                  }`}
                  style={{ minHeight: 'var(--tap-min)' }}
                >
                  {copied ? <Check className="w-4 h-4 shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />}
                  {copied ? t.copied : t.copyToClipboard}
                </button>
                <button
                  onClick={() => isSpeaking ? stopSpeaking() : speak(generatedSentence, { rate: speechRate, lang: 'en-US' })}
                  className={`flex-1 px-3 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold transition border ${
                    isSpeaking
                      ? 'bg-[var(--state-fill)] border-[var(--state-fill)] text-[var(--state-ink)]'
                      : 'bg-[var(--f-cap)] border-[var(--f-cap-border)] text-[var(--f-cap-ink)] hover:brightness-95 dark:hover:brightness-110'
                  }`}
                  style={{ minHeight: 'var(--tap-min)' }}
                >
                  {isSpeaking ? <VolumeX className="w-4 h-4 shrink-0" /> : <Volume2 className="w-4 h-4 shrink-0" />}
                  {isSpeaking ? t.stop : t.listen}
                </button>
                {/* El selector modifica a «Escuchar», así que se le parece en vez
                    de ser un `<select>` del sistema sin estilar. Y lleva nombre
                    accesible: sin él, un lector de pantalla anuncia «Normal» sin
                    decir normal DE QUÉ. */}
                <select
                  value={speechRate}
                  onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                  aria-label={language === 'es' ? 'Velocidad de la voz' : 'Speech speed'}
                  className="px-2 py-2 rounded-lg text-sm font-medium shrink-0
                             bg-[var(--f-cap)] border border-[var(--f-cap-border)] text-[var(--f-cap-ink)]"
                  style={{ minHeight: 'var(--tap-min)' }}
                >
                  <option value="0.7">{t.slow}</option>
                  <option value="0.9">{t.normal}</option>
                  <option value="1.2">{t.fast}</option>
                </select>
              </div>
            </div>

            {/* Los 3 modos */}
            {allModeSentences && (
              <div className="mt-4 pt-3 border-t border-gray-100">
                {/* Este control es de los que más enseñan —contrastar la misma
                    oración en sus tres formas— y estaba vestido de nota al pie:
                    `text-xs` y `text-indigo-600` a pelo.

                    El indigo era además un fallo de accesibilidad, no una
                    cuestión de gusto: la capa de modo oscuro remapea los
                    utilitarios de Tailwind, pero solo cubre `.bg-white` y
                    `.text-indigo-600` en la MISMA etiqueta, y aquí el fondo lo
                    pone un ancestro. El texto se quedaba en #4f46e5 sobre
                    #141826, o sea 2.81:1 cuando el mínimo para 12 px es 4.5:1.

                    Ahora usa la familia `--f-cap`, que es la misma que visten
                    las tres cápsulas que despliega: funciona en los dos temas
                    por construcción y ata visualmente el botón a lo que abre.
                    Los tres signos van como anticipo del contenido, que da peso
                    sin subir el tono de voz, y se colorean solos por token. */}
                <button
                  onClick={() => setShowAllModes(!showAllModes)}
                  aria-expanded={showAllModes}
                  className="w-full flex items-center gap-2 px-3 py-2 mb-2 rounded-lg
                             bg-[var(--f-cap)] border border-[var(--f-cap-border)]
                             text-sm font-semibold text-[var(--f-cap-ink)]
                             hover:brightness-95 dark:hover:brightness-110 transition"
                  style={{ minHeight: 'var(--tap-min)' }}
                >
                  <span className="text-[var(--f-cap-ink)] opacity-70 shrink-0">{showAllModes ? '▾' : '▸'}</span>
                  <span className="text-left">
                    {language === 'es' ? 'Ver los 3 modos' : 'See all 3 modes'}
                  </span>
                  {/* Anticipo: desaparece al abrir, cuando ya se ven de verdad. */}
                  {!showAllModes && (
                    <span className="ml-auto flex items-center gap-1.5 shrink-0" aria-hidden="true">
                      {['affirmative', 'negative', 'interrogative'].map(f => (
                        <FormSign key={f} form={f} className="text-sm font-bold leading-none" />
                      ))}
                    </span>
                  )}
                </button>
                {showAllModes && (
                  <div className="space-y-1.5">
                    {/* Aquí SOBREVIVÍA el cruce de ejes que se corrigió en la
                        barra de modos: ✓/✕/? sobre emerald, rose y amber, o sea
                        la negativa con el color del rol `auxiliary` y la
                        interrogativa con el del rol `adverb`. Mismo arreglo:
                        cápsula neutra y el tono solo en el signo. */}
                    {[['affirmative', 'aff'], ['negative', 'neg'], ['interrogative', 'int']].map(([forma, key]) => (
                      <div key={key} className="flex items-baseline gap-2 px-3 py-2 rounded-lg bg-[var(--f-cap)] border border-[var(--f-cap-border)]">
                        <FormSign form={forma} className="text-xs font-bold shrink-0" />
                        <span className="text-sm font-medium text-[var(--f-cap-ink)]">{allModeSentences[key]}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Semantic Warning - Compacto */}
            {semanticWarning && semanticWarning.type === 'warning' && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span className="text-sm text-amber-700 flex-1">{t.semanticWarning}</span>
                <button onClick={applyTenseFix} className="text-xs font-medium text-amber-700 underline">{t.changeTense}</button>
              </div>
            )}
          </div>
        )}

        </div>
        </main>
        )}

      {/* Barra de navegación inferior — persistente (modelo de pestañas, como QL) */}
      <nav className="flex-shrink-0 bg-white border-t border-gray-200 shadow-lg z-30" style={{ order: 2 }}>
        <div className="flex items-stretch max-w-2xl mx-auto">
          {/* Iconos emoji, iguales a Desgramatizador y Question Lab: 📖 Guía,
              ✏️ Práctica y 📊 Progreso son los mismos en las tres apps. El de la
              actividad principal sí cambia, porque cambia la actividad: aquí se
              CONSTRUYE y allá se analiza (🔍).
              El de Construye es el único que no es emoji: era 🧱, un MURO de
              ladrillos, cuando la analogía de la suite es la pieza de LEGO — y
              el comentario de antes decía «como el logo», que es justo lo que no
              era. Misma geometría que la pieza de la Guía de Question Lab. */}
          {[
            { panel: null, label: language === 'es' ? 'Construye' : 'Build',
              icon: <Blocks className="w-[1.15em] h-[1.15em]" strokeWidth={2} aria-hidden="true" /> },
            { panel: 'guide',    icon: <BookOpen className="w-[1.15em] h-[1.15em]" strokeWidth={2} aria-hidden="true" />, label: language === 'es' ? 'Guía' : 'Guide' },
            /* La tabla de tiempos, sexta pestaña y AQUÍ, entre la Guía y la
               Práctica: es lo que se consulta entre entender una forma y usarla,
               y ese es su lugar en la barra igual que en el orden de la clase.
               Estuvo fuera por miedo al ancho —seis controles en 360px— y el
               precio fue peor: solo se llegaba desde dentro de la Guía o con
               , así que desde el hub había que SALIR a otra pestaña
               del navegador para verla. El ancho se resuelve con el rótulo
               (9px por debajo de sm); lo otro no se resolvía.
               Icono dibujado y no emoji, como el de Construye: el reloj —lo
               obvio para «tiempos»— ya es el del Historial, y dos relojes en la
               misma barra no distinguen nada. Esto es lo que la pestaña
               contiene: una tabla de tres columnas.
               Y dibujado con la MISMA gramática que la pieza de Construye
               —rectángulos redondeados rellenos, `fill="currentColor"`, nada de
               contornos—: al lado de cuatro emoji, que son manchas sólidas, un
               icono de línea se ve descolorido y de otra familia.
               Cabecera y CUATRO celdas, no seis: con tres columnas —que sería lo
               fiel, una por forma— a 20px las celdas quedan del tamaño de un
               punto y el icono se lee como una trama de puntitos, más liviano
               que el ladrillo de al lado. Nadie cuenta las columnas de un icono;
               lo que sí se nota es que pese lo mismo que sus vecinos. */
            { panel: 'tiempos',  label: language === 'es' ? 'Tiempos' : 'Tenses',
              icon: <Table2 className="w-[1.15em] h-[1.15em]" strokeWidth={2} aria-hidden="true" /> },
            { panel: 'practice', icon: <PenLine className="w-[1.15em] h-[1.15em]" strokeWidth={2} aria-hidden="true" />, label: language === 'es' ? 'Práctica' : 'Practice' },
            { panel: 'progress', icon: <BarChart2 className="w-[1.15em] h-[1.15em]" strokeWidth={2} aria-hidden="true" />, label: language === 'es' ? 'Progreso' : 'Progress' },
            /* El contador va sobre `sentenceHistory.length`, NO sobre
               `totalAllTime`. Un número sobre un icono promete cuántas cosas hay
               ahí adentro, y totalAllTime es el total histórico de oraciones
               generadas: no bajaba nunca. El historial guarda las últimas 20 y
               el botón Limpiar lo vacía, así que la insignia decía 32 sobre un
               panel con 20 elementos, o sobre uno vacío después de limpiar.
               El total histórico no se pierde: sigue en el panel de Progreso,
               que es donde un acumulado tiene sentido. */
            { panel: 'history',  icon: <History className="w-[1.15em] h-[1.15em]" strokeWidth={2} aria-hidden="true" />, label: language === 'es' ? 'Historial' : 'History', badge: sentenceHistory.length || null },
          ].map(({ panel, icon, label, badge }) => (
            <button
              key={panel || 'home'}
              onClick={() => setActivePanel(panel)}
              aria-pressed={activePanel === panel}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors relative ${
                /* hover:text-gray-800 y no -600: QL salta de gris apagado a
                   texto pleno y por eso se nota. El salto a -600 era tan chico
                   que parecía que no pasaba nada. */
                activePanel === panel ? 'text-indigo-600' : 'text-muted hover:text-ink'
              }`}
            >
              <span className="text-xl leading-none" aria-hidden="true">{icon}</span>
              <span className="text-[9px] sm:text-[10px] font-bold leading-tight px-0.5">{label}</span>
              {badge && (
                <span aria-hidden="true" className="absolute top-1.5 right-1/2 translate-x-3 bg-indigo-600 text-white font-bold rounded-full flex items-center justify-center" style={{fontSize:'9px', minWidth:'16px', height:'16px', padding:'0 3px'}}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

    </div>
  );
};

export default EnglishSentenceBuilder;
