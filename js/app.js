// Mediclic - Etapa 3: dosis del día y confirmación de tomas.

const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];
const NOMBRES_DIAS = { 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb", 0: "Dom" };

let borrador = null; // medicamento que se está cargando o editando
let pantallaActual = ""; // para refrescar solo las pantallas que dependen de la hora

// ---------- Utilidades ----------
const app = () => document.getElementById("app");

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
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function fechaCorta(iso) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function mostrarErrorGeneral() {
  app().innerHTML = `
    <h1>Mediclic</h1>
    <div class="tarjeta">
      <p>No se pudieron leer los datos del teléfono.</p>
      <p>Cerrá la aplicación y volvé a abrirla.</p>
    </div>`;
}

// ---------- Pantalla: aviso inicial ----------
function pantallaAviso() {
  pantallaActual = "aviso";
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
    pantallaInicio();
  };
}

// ---------- Dosis del día (compartido por Inicio y Hoy) ----------
async function cargarAgendaDeHoy() {
  const fecha = hoyISO();
  const [medicamentos, tomas] = await Promise.all([
    DB.listar(),
    DB.listarTomasDeFecha(fecha)
  ]);
  const dosis = Agenda.dosisDelDia(medicamentos, tomas, fecha, new Date());
  return { fecha, medicamentos, dosis };
}

function horaDeRegistro(iso) {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit", minute: "2-digit", hour12: false
  });
}

function botonTomar(d) {
  return `<button class="boton" data-tomar data-med="${esc(d.medId)}" data-hora="${esc(d.hora)}" data-fecha="${esc(d.fecha)}">YA LO TOMÉ</button>`;
}

function activarBotonesTomar(origen) {
  document.querySelectorAll("[data-tomar]").forEach((b) => {
    b.onclick = () => pantallaConfirmarToma(b.dataset.med, b.dataset.hora, b.dataset.fecha, origen);
  });
}

function volverA(origen) {
  return origen === "hoy" ? pantallaHoy() : pantallaInicio();
}

function tarjetaDestacada(d) {
  const vencida = d.estado === "vencida";
  return `
    <div class="tarjeta destacada">
      <p class="etiqueta">${vencida ? "Toma sin confirmar" : "Próxima toma"}</p>
      <p class="med-horas">${esc(d.hora)}</p>
      <p class="med-nombre">${esc(d.nombre)}</p>
      <p class="med-dato">Dosis: ${esc(d.dosis)}</p>
      ${vencida ? `<p class="aviso">Ya pasó el horario. Si tenés dudas, consultá a tu profesional de salud.</p>` : ""}
      ${d.puedeConfirmar ? botonTomar(d) : `<p class="med-dato">Todavía falta para esta toma.</p>`}
    </div>`;
}

function tarjetaDosis(d) {
  const clase = d.estado === "tomado" ? "dosis-tomada" : d.estado === "vencida" ? "dosis-vencida" : "";
  let estado = "";
  if (d.estado === "tomado") {
    estado = `<p class="estado estado-tomada">✓ Tomado a las ${horaDeRegistro(d.horaReal)}</p>`;
  } else if (d.estado === "vencida") {
    estado = `<p class="estado estado-vencida">Vencida</p>
              <p class="aviso">Ya pasó el horario. Si tenés dudas, consultá a tu profesional de salud.</p>`;
  } else {
    estado = `<p class="estado estado-pendiente">Pendiente</p>`;
  }
  return `
    <div class="tarjeta dosis ${clase}">
      <p class="med-horas">${esc(d.hora)}</p>
      <p class="med-nombre">${esc(d.nombre)}</p>
      <p class="med-dato">Dosis: ${esc(d.dosis)}</p>
      ${estado}
      ${d.estado !== "tomado" && d.puedeConfirmar ? botonTomar(d) : ""}
    </div>`;
}

// ---------- Pantalla: inicio ----------
async function pantallaInicio() {
  pantallaActual = "inicio";
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
  const proxima = dosis.find((d) => d.estado !== "tomado");

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
      <p class="med-dato" style="margin:0"><strong>${tomadas} de ${total}</strong> dosis registradas hoy</p>
      <div class="barra"><div class="barra-relleno" style="width:${pct}%"></div></div>
    </div>`;

  app().innerHTML = `
    <h1>${saludo()}</h1>
    <p class="fecha">${fechaHoy()}</p>
    ${bloqueProxima}
    ${bloqueProgreso}
    <button class="boton" id="ir-hoy">MEDICAMENTOS DE HOY</button>
    <button class="boton boton-secundario" id="ir-lista">MIS MEDICAMENTOS</button>`;

  document.getElementById("ir-hoy").onclick = pantallaHoy;
  document.getElementById("ir-lista").onclick = pantallaLista;
  const agregar = document.getElementById("ir-agregar");
  if (agregar) agregar.onclick = () => pantallaFormulario();
  activarBotonesTomar("inicio");
}

// ---------- Pantalla: medicamentos de hoy ----------
async function pantallaHoy() {
  pantallaActual = "hoy";
  let datos;
  try {
    datos = await cargarAgendaDeHoy();
  } catch (e) {
    return mostrarErrorGeneral();
  }
  if (pantallaActual !== "hoy") return;

  const contenido = datos.dosis.length === 0
    ? `<div class="tarjeta"><p>Hoy no tenés tomas programadas.</p></div>`
    : datos.dosis.map(tarjetaDosis).join("");

  app().innerHTML = `
    <button class="volver" id="volver">← Volver</button>
    <h1>Hoy</h1>
    <p class="fecha">${fechaHoy()}</p>
    ${contenido}`;

  document.getElementById("volver").onclick = pantallaInicio;
  activarBotonesTomar("hoy");
}

// ---------- Pantalla: confirmar toma ----------
async function pantallaConfirmarToma(medId, hora, fecha, origen) {
  pantallaActual = "confirmar";
  let m;
  try {
    m = await DB.obtener(medId);
  } catch (e) {
    return mostrarErrorGeneral();
  }
  if (!m) return volverA(origen);

  app().innerHTML = `
    <h1>¿Ya lo tomaste?</h1>
    <div class="tarjeta">
      <p class="med-nombre">${esc(m.nombre)}</p>
      <p class="med-dato">Dosis: ${esc(m.dosis)}</p>
      <p class="med-dato">Horario programado: ${esc(hora)}</p>
      <button class="boton" id="si">SÍ, YA LO TOMÉ</button>
      <button class="boton boton-secundario" id="no">NO, VOLVER</button>
    </div>`;

  document.getElementById("no").onclick = () => volverA(origen);
  document.getElementById("si").onclick = async () => {
    document.getElementById("si").disabled = true; // evita doble toque
    try {
      await DB.registrarToma({
        id: Agenda.idToma(medId, fecha, hora),
        medId,
        nombre: m.nombre,
        dosis: m.dosis,
        fecha,
        horaProgramada: hora,
        horaReal: new Date().toISOString(),
        estado: "tomado"
      });
    } catch (e) {
      return mostrarErrorGeneral();
    }
    volverA(origen);
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
  pantallaActual = "lista";
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
  pantallaActual = "eliminar";
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
  pantallaActual = "formulario";
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
if (localStorage.getItem("aviso_aceptado") === "si") {
  pantallaInicio();
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
setInterval(refrescarPantalla, 30000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refrescarPantalla();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
