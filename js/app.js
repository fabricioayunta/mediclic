// Mediclic - Etapa 4 y 5: alarma, posponer/omitir, historial, ajustes y copias.

const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];
const NOMBRES_DIAS = { 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb", 0: "Dom" };

let borrador = null;       // medicamento que se está cargando o editando
let pantallaActual = "";   // para saber qué pantalla hay que refrescar
const sonadasEnSesion = new Set(); // alarmas que ya sonaron en esta sesión

// ---------- Utilidades ----------
const app = () => document.getElementById("app");

function entrarEn(nombre) {
  pantallaActual = nombre;
  if (nombre !== "alarma") Sonido.detener();
}

function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function saludo() {
  const h = new Date().getHours();
  if (h < 12) return "¡Buen día!";
  if (h < 20) return "¡Buenas tardes!";
  return "¡Buenas noches!";
}

function fechaHoy() {
  return new Date().toLocaleDateString("es-AR", {
    weekday: "long", day: "numeric", month: "long"
  });
}

function hoyISO() {
  return Agenda.fechaLocalISO(new Date());
}

function fechaCorta(iso) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function horaDeMs(ms) {
  return new Date(ms).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function horaDeRegistro(iso) {
  const t = new Date(iso);
  return isNaN(t.getTime()) ? "—" : horaDeMs(t.getTime());
}

function mostrarErrorGeneral() {
  entrarEn("error");
  app().innerHTML = `
    <h1>Mediclic</h1>
    <div class="tarjeta">
      <p>No se pudieron leer los datos del teléfono.</p>
      <p>Cerrá la aplicación y volvé a abrirla.</p>
    </div>`;
}

// ---------- Pantalla: aviso inicial ----------
function pantallaAviso() {
  entrarEn("aviso");
  app().innerHTML = `
    <h1>Mediclic</h1>
    <div class="tarjeta">
      <p><strong>Antes de empezar</strong></p>
      <p>Mediclic te ayuda a recordar tus medicamentos. No reemplaza a tu médico ni a tu farmacéutico.</p>
      <p>Cargá tus medicamentos siguiendo siempre las indicaciones de tu profesional de salud.</p>
      <button class="boton" id="aceptar">ENTENDIDO</button>
    </div>`;
  document.getElementById("aceptar").onclick = () => {
    localStorage.setItem("aviso_aceptado", "si");
    if (typeof Nativo !== "undefined") Nativo.iniciar();
    pantallaInicio();
  };
}

// ---------- Dosis del día (compartido por Inicio, Hoy y alarma) ----------
async function cargarAgendaDeHoy() {
  const fecha = hoyISO();
  const [medicamentos, tomas] = await Promise.all([
    DB.listar(),
    DB.listarTomasDeFecha(fecha)
  ]);
  const dosis = Agenda.dosisDelDia(medicamentos, tomas, fecha, new Date());
  return { fecha, medicamentos, dosis };
}

function datosBoton(d) {
  return `data-med="${esc(d.medId)}" data-hora="${esc(d.hora)}" data-fecha="${esc(d.fecha)}"`;
}

function botonAccion(accion, d, texto, clase) {
  return `<button class="boton ${clase || ""}" data-accion="${accion}" ${datosBoton(d)}>${texto}</button>`;
}

function activarBotones(origen) {
  document.querySelectorAll("[data-accion]").forEach((b) => {
    b.onclick = () =>
      pantallaConfirmar(b.dataset.accion, b.dataset.med, b.dataset.hora, b.dataset.fecha, origen);
  });
}

async function volverA(origen) {
  if (origen === "hoy") return pantallaHoy();
  if (origen === "alarma") {
    sonadasEnSesion.clear(); // si quedó algo sin resolver, vuelve a sonar
    await pantallaInicio();
    return revisarAlarmas();
  }
  return pantallaInicio();
}

function accionesDeDosis(d) {
  if (d.estado === "tomado" || d.estado === "omitido") {
    return d.fecha === hoyISO() ? botonAccion("deshacer", d, "DESHACER", "boton-secundario boton-chico") : "";
  }
  if (!d.puedeConfirmar) return "";
  const omitir = d.estado === "vencida" || d.estado === "pospuesto"
    ? botonAccion("omitir", d, "OMITIR ESTA TOMA", "boton-secundario boton-chico")
    : "";
  return botonAccion("tomar", d, "YA LO TOMÉ") + omitir;
}

function tarjetaDestacada(d) {
  const vencida = d.estado === "vencida";
  const pospuesta = d.estado === "pospuesto";
  const etiqueta = vencida ? "Toma sin confirmar" : pospuesta ? "Toma pospuesta" : "Próxima toma";
  return `
    <div class="tarjeta destacada">
      <p class="etiqueta">${etiqueta}</p>
      <p class="med-horas">${esc(d.hora)}</p>
      <p class="med-nombre">${esc(d.nombre)}</p>
      <p class="med-dato">Dosis: ${esc(d.dosis)}</p>
      ${pospuesta ? `<p class="estado estado-pospuesta">Te aviso de nuevo a las ${horaDeMs(d.pospuestaHasta)}</p>` : ""}
      ${vencida ? `<p class="aviso">Ya pasó el horario. Si tenés dudas sobre qué hacer, consultá a tu profesional de salud.</p>` : ""}
      ${d.puedeConfirmar ? accionesDeDosis(d) : `<p class="med-dato">Todavía falta para esta toma.</p>`}
    </div>`;
}

function tarjetaDosis(d, conAcciones) {
  const pasado = d.fecha < hoyISO();
  const clases = {
    tomado: "dosis-tomada", omitido: "dosis-omitida",
    vencida: "dosis-vencida", pospuesto: "dosis-pospuesta", pendiente: ""
  };
  let estado;
  if (d.estado === "tomado") {
    estado = `<p class="estado estado-tomada">✓ Tomado a las ${horaDeRegistro(d.horaReal)}</p>`;
  } else if (d.estado === "omitido") {
    estado = `<p class="estado estado-omitida">Omitido</p>`;
  } else if (d.estado === "vencida") {
    estado = `<p class="estado estado-vencida">${pasado ? "Sin registrar" : "Vencida"}</p>` +
      (conAcciones ? `<p class="aviso">Ya pasó el horario. Si tenés dudas sobre qué hacer, consultá a tu profesional de salud.</p>` : "");
  } else if (d.estado === "pospuesto") {
    estado = `<p class="estado estado-pospuesta">Pospuesta hasta las ${horaDeMs(d.pospuestaHasta)}</p>`;
  } else {
    estado = `<p class="estado estado-pendiente">Pendiente</p>`;
  }
  const veces = d.veces > 0
    ? `<p class="med-dato">Pospuesta ${d.veces} ${d.veces === 1 ? "vez" : "veces"}</p>`
    : "";
  return `
    <div class="tarjeta dosis ${clases[d.estado] || ""}">
      <p class="med-horas">${esc(d.hora)}</p>
      <p class="med-nombre">${esc(d.nombre)}</p>
      <p class="med-dato">Dosis: ${esc(d.dosis)}</p>
      ${estado}
      ${veces}
      ${conAcciones ? accionesDeDosis(d) : ""}
    </div>`;
}

// ---------- Pantalla: inicio ----------
async function pantallaInicio() {
  entrarEn("inicio");
  let datos;
  try {
    datos = await cargarAgendaDeHoy();
  } catch (e) {
    return mostrarErrorGeneral();
  }
  if (pantallaActual !== "inicio") return;

  const { medicamentos, dosis } = datos;
  const total = dosis.length;
  const tomadas = dosis.filter((d) => d.estado === "tomado").length;
  const omitidas = dosis.filter((d) => d.estado === "omitido").length;
  const proxima = dosis.find((d) => d.estado !== "tomado" && d.estado !== "omitido");

  let bloqueProxima;
  if (medicamentos.length === 0) {
    bloqueProxima = `
      <div class="tarjeta">
        <p>Todavía no cargaste ningún medicamento.</p>
        <button class="boton" id="ir-agregar">+ AGREGAR MEDICAMENTO</button>
      </div>`;
  } else if (total === 0) {
    bloqueProxima = `<div class="tarjeta"><p>Hoy no tenés tomas programadas.</p></div>`;
  } else if (!proxima) {
    bloqueProxima = `
      <div class="tarjeta">
        <p class="med-nombre">¡Listo por hoy!</p>
        <p>Ya registraste todas las tomas de hoy.</p>
      </div>`;
  } else {
    bloqueProxima = tarjetaDestacada(proxima);
  }

  const pct = total ? Math.round((tomadas / total) * 100) : 0;
  const bloqueProgreso = total === 0 ? "" : `
    <div class="tarjeta">
      <p class="med-dato" style="margin:0"><strong>${tomadas} de ${total}</strong> dosis tomadas hoy${omitidas ? ` · ${omitidas} omitida${omitidas === 1 ? "" : "s"}` : ""}</p>
      <div class="barra"><div class="barra-relleno" style="width:${pct}%"></div></div>
    </div>`;

  app().innerHTML = `
    <h1>${saludo()}</h1>
    <p class="fecha">${fechaHoy()}</p>
    ${bloqueProxima}
    ${bloqueProgreso}
    <button class="boton" id="ir-hoy">MEDICAMENTOS DE HOY</button>
    <button class="boton boton-secundario" id="ir-historial">HISTORIAL</button>
    <button class="boton boton-secundario" id="ir-lista">MIS MEDICAMENTOS</button>
    <button class="volver" id="ir-ajustes" style="margin-top:12px">⚙ Ajustes</button>`;

  document.getElementById("ir-hoy").onclick = pantallaHoy;
  document.getElementById("ir-historial").onclick = () => pantallaHistorial();
  document.getElementById("ir-lista").onclick = pantallaLista;
  document.getElementById("ir-ajustes").onclick = () => pantallaAjustes();
  const agregar = document.getElementById("ir-agregar");
  if (agregar) agregar.onclick = () => pantallaFormulario();
  activarBotones("inicio");
}

// ---------- Pantalla: medicamentos de hoy ----------
async function pantallaHoy() {
  entrarEn("hoy");
  let datos;
  try {
    datos = await cargarAgendaDeHoy();
  } catch (e) {
    return mostrarErrorGeneral();
  }
  if (pantallaActual !== "hoy") return;

  const contenido = datos.dosis.length === 0
    ? `<div class="tarjeta"><p>Hoy no tenés tomas programadas.</p></div>`
    : datos.dosis.map((d) => tarjetaDosis(d, true)).join("");

  app().innerHTML = `
    <button class="volver" id="volver">← Volver</button>
    <h1>Hoy</h1>
    <p class="fecha">${fechaHoy()}</p>
    ${contenido}`;

  document.getElementById("volver").onclick = pantallaInicio;
  activarBotones("hoy");
}

// ---------- Pantalla: confirmar (tomar / omitir / deshacer) ----------
const TEXTOS_CONFIRMAR = {
  tomar: {
    titulo: "¿Ya lo tomaste?",
    detalle: "",
    si: "SÍ, YA LO TOMÉ",
    claseSi: ""
  },
  omitir: {
    titulo: "¿Omitir esta toma?",
    detalle: "Va a quedar registrada como omitida. Mediclic no te indica qué hacer con una dosis que no tomaste: consultá a tu profesional de salud.",
    si: "SÍ, OMITIR",
    claseSi: "boton-peligro"
  },
  deshacer: {
    titulo: "¿Deshacer el registro?",
    detalle: "Se borra este registro y la toma vuelve a quedar sin confirmar.",
    si: "SÍ, DESHACER",
    claseSi: "boton-peligro"
  }
};

async function pantallaConfirmar(accion, medId, hora, fecha, origen) {
  entrarEn("confirmar");
  const textos = TEXTOS_CONFIRMAR[accion];
  if (!textos) return volverA(origen);

  let m;
  try {
    m = await DB.obtener(medId);
  } catch (e) {
    return mostrarErrorGeneral();
  }
  if (!m && accion !== "deshacer") return volverA(origen);

  const nombre = m ? m.nombre : "Esta toma";
  const dosis = m ? m.dosis : "";

  app().innerHTML = `
    <h1>${textos.titulo}</h1>
    <div class="tarjeta">
      <p class="med-nombre">${esc(nombre)}</p>
      ${dosis ? `<p class="med-dato">Dosis: ${esc(dosis)}</p>` : ""}
      <p class="med-dato">Horario programado: ${esc(hora)}</p>
      ${textos.detalle ? `<p class="aviso">${textos.detalle}</p>` : ""}
      <button class="boton ${textos.claseSi}" id="si">${textos.si}</button>
      <button class="boton boton-secundario" id="no">NO, VOLVER</button>
    </div>`;

  document.getElementById("no").onclick = () => volverA(origen);
  document.getElementById("si").onclick = async () => {
    document.getElementById("si").disabled = true; // evita doble toque
    try {
      const id = Agenda.idToma(medId, fecha, hora);
      if (accion === "deshacer") {
        await DB.borrarToma(id);
      } else {
        await DB.guardarEstado({
          id, medId, nombre, dosis, fecha,
          horaProgramada: hora,
          horaReal: new Date().toISOString(),
          estado: accion === "tomar" ? "tomado" : "omitido"
        });
      }
    } catch (e) {
      return mostrarErrorGeneral();
    }
    volverA(origen);
  };
}

// ---------- Alarma ----------
const PANTALLAS_CON_ALARMA = ["inicio", "hoy", "lista", "historial", "dia", "ajustes"];

async function revisarAlarmas() {
  // No se interrumpe un formulario ni una confirmación en curso.
  if (!PANTALLAS_CON_ALARMA.includes(pantallaActual)) return;
  let datos;
  try {
    datos = await cargarAgendaDeHoy();
  } catch (e) {
    return;
  }
  if (!PANTALLAS_CON_ALARMA.includes(pantallaActual)) return;

  const dosis = datos.dosis.find((d) => d.debeSonar && !sonadasEnSesion.has(d.claveAlarma));
  if (!dosis) return;
  sonadasEnSesion.add(dosis.claveAlarma);

  if (typeof Nativo !== "undefined" && Nativo.disponible()) {
    Nativo.quitarAvisosDeDosis(dosis.id); // ya se muestra la alarma dentro de la app
  } else if (document.hidden) {
    Sonido.notificar(
      `Es hora de tomar tu medicamento: ${dosis.nombre}`,
      `Dosis registrada: ${dosis.dosis}. Hora: ${dosis.hora}`,
      dosis.claveAlarma
    );
  }
  pantallaAlarma(dosis);
}

function pantallaAlarma(d) {
  entrarEn("alarma");
  const minutos = Config.get("posponerMin");
  app().innerHTML = `
    <div class="alarma" role="alertdialog" aria-live="assertive">
      <p class="alarma-icono" aria-hidden="true">⏰</p>
      <h1>Es hora de tomar tu medicamento</h1>
      <p class="alarma-nombre">${esc(d.nombre)}</p>
      <p class="alarma-dosis">Dosis registrada: ${esc(d.dosis)}</p>
      <p class="med-dato">Horario: ${esc(d.hora)}</p>
      <button class="boton" id="al-tomar">YA LO TOMÉ</button>
      <button class="boton boton-secundario" id="al-posponer">POSPONER ${minutos} MIN</button>
      <button class="boton boton-secundario boton-chico" id="al-omitir">OMITIR ESTA TOMA</button>
    </div>`;
  Sonido.iniciar();

  const base = {
    id: d.id, medId: d.medId, nombre: d.nombre, dosis: d.dosis,
    fecha: d.fecha, horaProgramada: d.hora
  };
  const bloquear = () => {
    ["al-tomar", "al-posponer", "al-omitir"].forEach((id) => {
      document.getElementById(id).disabled = true;
    });
  };

  document.getElementById("al-tomar").onclick = async () => {
    bloquear();
    try {
      await DB.guardarEstado({ ...base, horaReal: new Date().toISOString(), estado: "tomado" });
    } catch (e) {
      return mostrarErrorGeneral();
    }
    volverA("alarma");
  };
  document.getElementById("al-posponer").onclick = async () => {
    bloquear();
    try {
      await DB.guardarEstado({
        ...base, horaReal: null, estado: "pospuesto",
        pospuestaHasta: Date.now() + minutos * 60000
      });
    } catch (e) {
      return mostrarErrorGeneral();
    }
    volverA("alarma");
  };
  document.getElementById("al-omitir").onclick = () => {
    pantallaConfirmar("omitir", d.medId, d.hora, d.fecha, "alarma");
  };
}

// ---------- Pantalla: lista de medicamentos ----------
function tarjetaMedicamento(m) {
  const dias = m.frecuencia === "todos"
    ? "Todos los días"
    : m.dias.map((d) => NOMBRES_DIAS[d]).join(", ");
  const hasta = m.fechaFin ? ` · hasta ${fechaCorta(m.fechaFin)}` : "";
  return `
    <div class="tarjeta">
      <p class="med-nombre">${esc(m.nombre)}</p>
      <p class="med-dato">Dosis: ${esc(m.dosis)}</p>
      <p class="med-horas">${esc(m.horarios.join("  ·  "))}</p>
      <p class="med-dato">${dias}</p>
      <p class="med-dato">Desde ${fechaCorta(m.fechaInicio)}${hasta}</p>
      ${m.medico ? `<p class="med-dato">Indicado por: ${esc(m.medico)}</p>` : ""}
      ${m.observaciones ? `<p class="med-dato">Notas: ${esc(m.observaciones)}</p>` : ""}
      <div class="acciones">
        <button class="boton boton-secundario" data-editar="${esc(m.id)}">EDITAR</button>
        <button class="boton boton-peligro" data-eliminar="${esc(m.id)}">ELIMINAR</button>
      </div>
    </div>`;
}

async function pantallaLista() {
  entrarEn("lista");
  let medicamentos = [];
  try {
    medicamentos = await DB.listar();
  } catch (e) {
    return mostrarErrorGeneral();
  }
  medicamentos.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const contenido = medicamentos.length === 0
    ? `<div class="tarjeta"><p>Todavía no cargaste ningún medicamento.</p></div>`
    : medicamentos.map(tarjetaMedicamento).join("");

  app().innerHTML = `
    <button class="volver" id="volver">← Volver</button>
    <h1>Mis medicamentos</h1>
    <div style="height:16px"></div>
    ${contenido}
    <button class="boton" id="agregar">+ AGREGAR MEDICAMENTO</button>`;

  document.getElementById("volver").onclick = pantallaInicio;
  document.getElementById("agregar").onclick = () => pantallaFormulario();
  document.querySelectorAll("[data-editar]").forEach((b) => {
    b.onclick = () => pantallaFormulario(b.dataset.editar);
  });
  document.querySelectorAll("[data-eliminar]").forEach((b) => {
    b.onclick = () => pantallaConfirmarEliminar(b.dataset.eliminar);
  });
}

// ---------- Pantalla: confirmar eliminación ----------
async function pantallaConfirmarEliminar(id) {
  entrarEn("eliminar");
  let m;
  try {
    m = await DB.obtener(id);
  } catch (e) {
    return mostrarErrorGeneral();
  }
  if (!m) return pantallaLista();

  app().innerHTML = `
    <h1>¿Eliminar medicamento?</h1>
    <div class="tarjeta">
      <p class="med-nombre">${esc(m.nombre)}</p>
      <p>Se va a borrar de tu lista y no vas a recibir más recordatorios de este medicamento.</p>
      <button class="boton boton-peligro" id="si">SÍ, ELIMINAR</button>
      <button class="boton boton-secundario" id="no">NO, VOLVER</button>
    </div>`;
  document.getElementById("no").onclick = pantallaLista;
  document.getElementById("si").onclick = async () => {
    try {
      await DB.eliminar(id);
    } catch (e) {
      return mostrarErrorGeneral();
    }
    pantallaLista();
  };
}

// ---------- Pantalla: formulario (agregar / editar) ----------
async function pantallaFormulario(id) {
  entrarEn("formulario");
  if (id) {
    let m;
    try {
      m = await DB.obtener(id);
    } catch (e) {
      return mostrarErrorGeneral();
    }
    if (!m) return pantallaLista();
    borrador = JSON.parse(JSON.stringify(m));
  } else {
    borrador = {
      id: DB.nuevoId(),
      nombre: "",
      dosis: "",
      horarios: ["08:00"],
      frecuencia: "todos",
      dias: [...ORDEN_DIAS],
      fechaInicio: hoyISO(),
      fechaFin: "",
      observaciones: "",
      medico: ""
    };
  }
  dibujarFormulario(Boolean(id));
}

function dibujarFormulario(esEdicion) {
  const filasHorarios = borrador.horarios.map((h, i) => `
    <div class="fila-hora">
      <input type="time" class="f-hora" value="${esc(h)}" aria-label="Horario ${i + 1}">
      ${borrador.horarios.length > 1
        ? `<button type="button" class="quitar" data-quitar="${i}" aria-label="Quitar horario">✕</button>`
        : ""}
    </div>`).join("");

  const botonesDias = ORDEN_DIAS.map((d) => `
    <label class="dia">
      <input type="checkbox" class="f-dia" value="${d}" ${borrador.dias.includes(d) ? "checked" : ""}>
      <span>${NOMBRES_DIAS[d]}</span>
    </label>`).join("");

  app().innerHTML = `
    <button class="volver" id="volver">← Volver</button>
    <h1>${esEdicion ? "Editar medicamento" : "Nuevo medicamento"}</h1>
    <p class="ayuda" style="margin-bottom:20px">Cargá los datos tal como te los indicó tu profesional de salud.</p>

    <div class="campo">
      <label class="titulo" for="f-nombre">Nombre del medicamento</label>
      <input type="text" id="f-nombre" value="${esc(borrador.nombre)}" placeholder="Ej.: Losartán" autocomplete="off">
    </div>

    <div class="campo">
      <label class="titulo" for="f-dosis">Dosis indicada</label>
      <input type="text" id="f-dosis" value="${esc(borrador.dosis)}" placeholder="Ej.: 1 comprimido" autocomplete="off">
    </div>

    <div class="campo">
      <span class="titulo" style="font-weight:700;display:block;margin-bottom:8px">Horarios de toma</span>
      ${filasHorarios}
      <button type="button" class="boton boton-secundario" id="agregar-hora" style="min-height:56px;font-size:20px">+ AGREGAR OTRO HORARIO</button>
    </div>

    <div class="campo">
      <label class="titulo" for="f-frecuencia">¿Qué días lo tomás?</label>
      <select id="f-frecuencia">
        <option value="todos" ${borrador.frecuencia === "todos" ? "selected" : ""}>Todos los días</option>
        <option value="algunos" ${borrador.frecuencia === "algunos" ? "selected" : ""}>Solo algunos días</option>
      </select>
      <div class="dias ${borrador.frecuencia === "algunos" ? "" : "oculto"}" id="bloque-dias">${botonesDias}</div>
    </div>

    <div class="campo">
      <label class="titulo" for="f-inicio">Fecha de inicio</label>
      <input type="date" id="f-inicio" value="${esc(borrador.fechaInicio)}">
    </div>

    <div class="campo">
      <label class="titulo" for="f-fin">Fecha de finalización (opcional)</label>
      <input type="date" id="f-fin" value="${esc(borrador.fechaFin)}">
      <p class="ayuda">Dejala vacía si no tiene fecha de fin.</p>
    </div>

    <div class="campo">
      <label class="titulo" for="f-medico">Médico o profesional (opcional)</label>
      <input type="text" id="f-medico" value="${esc(borrador.medico)}" autocomplete="off">
    </div>

    <div class="campo">
      <label class="titulo" for="f-notas">Observaciones (opcional)</label>
      <textarea id="f-notas" placeholder="Ej.: tomar con las comidas">${esc(borrador.observaciones)}</textarea>
    </div>

    <div class="error oculto" id="f-error" role="alert"></div>

    <button class="boton" id="guardar">GUARDAR</button>
    <button class="boton boton-secundario" id="cancelar">CANCELAR</button>`;

  document.getElementById("volver").onclick = pantallaLista;
  document.getElementById("cancelar").onclick = pantallaLista;
  document.getElementById("guardar").onclick = guardarFormulario;

  document.getElementById("agregar-hora").onclick = () => {
    leerFormulario();
    borrador.horarios.push("");
    dibujarFormulario(esEdicion);
  };
  document.querySelectorAll("[data-quitar]").forEach((b) => {
    b.onclick = () => {
      leerFormulario();
      borrador.horarios.splice(Number(b.dataset.quitar), 1);
      dibujarFormulario(esEdicion);
    };
  });
  document.getElementById("f-frecuencia").onchange = (e) => {
    document.getElementById("bloque-dias").classList.toggle("oculto", e.target.value !== "algunos");
  };
}

function leerFormulario() {
  const valor = (id) => document.getElementById(id).value;
  borrador.nombre = valor("f-nombre").trim();
  borrador.dosis = valor("f-dosis").trim();
  borrador.horarios = [...document.querySelectorAll(".f-hora")].map((i) => i.value);
  borrador.frecuencia = valor("f-frecuencia");
  borrador.dias = [...document.querySelectorAll(".f-dia")]
    .filter((c) => c.checked)
    .map((c) => Number(c.value));
  borrador.fechaInicio = valor("f-inicio");
  borrador.fechaFin = valor("f-fin");
  borrador.medico = valor("f-medico").trim();
  borrador.observaciones = valor("f-notas").trim();
}

function validar(m) {
  if (!m.nombre) return "Escribí el nombre del medicamento.";
  if (!m.dosis) return "Escribí la dosis indicada (por ejemplo: 1 comprimido).";
  if (m.horarios.length === 0 || m.horarios.some((h) => !h)) {
    return "Completá todos los horarios o quitá los que sobran.";
  }
  if (m.frecuencia === "algunos" && m.dias.length === 0) return "Elegí al menos un día.";
  if (!m.fechaInicio) return "Elegí la fecha de inicio.";
  if (m.fechaFin && m.fechaFin < m.fechaInicio) {
    return "La fecha de finalización no puede ser anterior a la de inicio.";
  }
  return "";
}

async function guardarFormulario() {
  leerFormulario();
  const error = validar(borrador);
  const caja = document.getElementById("f-error");
  if (error) {
    caja.textContent = error;
    caja.classList.remove("oculto");
    caja.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  borrador.horarios = [...new Set(borrador.horarios)].sort();
  if (borrador.frecuencia === "todos") borrador.dias = [...ORDEN_DIAS];
  try {
    await DB.guardar(borrador);
  } catch (e) {
    caja.textContent = "No se pudo guardar. Probá de nuevo.";
    caja.classList.remove("oculto");
    return;
  }
  pantallaLista();
}

// ---------- Arranque ----------
Config.aplicar();

// Los navegadores permiten el sonido recién después de un toque en la pantalla.
["pointerdown", "touchstart", "keydown"].forEach((evento) => {
  document.addEventListener(evento, Sonido.desbloquear, { passive: true });
});

if (localStorage.getItem("aviso_aceptado") === "si") {
  pantallaInicio().then(() => setTimeout(revisarAlarmas, 1200));
  if (typeof Nativo !== "undefined") Nativo.iniciar();
} else {
  pantallaAviso();
}

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist();
}

// Mientras se ve Inicio u Hoy, se actualiza solo cada 30 segundos
// (para que una dosis pase de pendiente a vencida sin tocar nada).
async function refrescarPantalla() {
  if (pantallaActual !== "inicio" && pantallaActual !== "hoy") return;
  const y = window.scrollY;
  if (pantallaActual === "inicio") await pantallaInicio();
  else await pantallaHoy();
  window.scrollTo(0, y);
}

setInterval(revisarAlarmas, 15000);
setInterval(refrescarPantalla, 30000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refrescarPantalla();
    revisarAlarmas();
    if (typeof Nativo !== "undefined") Nativo.pedirReprogramar();
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
