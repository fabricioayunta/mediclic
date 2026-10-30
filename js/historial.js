// Mediclic - Historial: calendario mensual y detalle por día.

let mesVisible = null; // { anio, mes } (mes de 0 a 11)

function nombreMes(anio, mes) {
  const t = new Date(anio, mes, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function fechaDeCalendario(anio, mes, dia) {
  return `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function fechaLarga(fechaISO) {
  const [a, m, d] = fechaISO.split("-").map(Number);
  const t = new Date(a, m - 1, d).toLocaleDateString("es-AR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const MARCAS_DIA = { ok: "✓", parcial: "!", falla: "✕" };
const NOMBRES_ESTADO_DIA = {
  ok: "todas las tomas registradas",
  parcial: "algunas tomas sin registrar u omitidas",
  falla: "ninguna toma registrada",
  pendiente: "tomas pendientes",
  vacio: "sin tomas programadas"
};

async function pantallaHistorial(anio, mes) {
  entrarEn("historial");
  const ahora = new Date();
  if (anio === undefined) {
    anio = ahora.getFullYear();
    mes = ahora.getMonth();
  }
  mesVisible = { anio, mes };

  const diasDelMes = new Date(anio, mes + 1, 0).getDate();
  const desde = fechaDeCalendario(anio, mes, 1);
  const hasta = fechaDeCalendario(anio, mes, diasDelMes);

  let medicamentos, tomas;
  try {
    [medicamentos, tomas] = await Promise.all([DB.listar(), DB.listarTomasEntre(desde, hasta)]);
  } catch (e) {
    return mostrarErrorGeneral();
  }
  if (pantallaActual !== "historial") return;

  const porFecha = {};
  tomas.forEach((t) => {
    (porFecha[t.fecha] = porFecha[t.fecha] || []).push(t);
  });

  const hoy = hoyISO();
  let tomadasMes = 0;
  let evaluablesMes = 0;
  const celdas = [];
  const desplazamiento = (new Date(anio, mes, 1).getDay() + 6) % 7; // semana desde el lunes
  for (let i = 0; i < desplazamiento; i++) celdas.push(`<span class="cal-vacio"></span>`);

  for (let dia = 1; dia <= diasDelMes; dia++) {
    const fecha = fechaDeCalendario(anio, mes, dia);
    const dosis = Agenda.dosisDelDia(medicamentos, porFecha[fecha] || [], fecha, ahora);
    const r = Agenda.resumenDia(dosis);
    tomadasMes += r.tomadas;
    evaluablesMes += r.tomadas + r.omitidas + r.vencidas;
    const clases = `cal-dia cal-${r.estado}${fecha === hoy ? " cal-hoy" : ""}`;
    celdas.push(`
      <button class="${clases}" data-dia="${fecha}" ${r.total === 0 ? "disabled" : ""}
        aria-label="${dia}: ${NOMBRES_ESTADO_DIA[r.estado]}">
        <span class="n">${dia}</span><span class="m">${MARCAS_DIA[r.estado] || ""}</span>
      </button>`);
  }

  const cumplimiento = evaluablesMes === 0
    ? "Todavía no hay tomas para evaluar en este mes."
    : `<strong>${tomadasMes} de ${evaluablesMes}</strong> tomas registradas como tomadas (${Math.round((tomadasMes / evaluablesMes) * 100)}%).`;

  app().innerHTML = `
    <button class="volver" id="volver">← Volver</button>
    <h1>Historial</h1>
    <div class="mes-nav">
      <button class="mes-boton" id="mes-anterior" aria-label="Mes anterior">‹</button>
      <p class="mes-nombre">${nombreMes(anio, mes)}</p>
      <button class="mes-boton" id="mes-siguiente" aria-label="Mes siguiente">›</button>
    </div>
    <div class="calendario" role="grid">
      ${["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((n) => `<span class="cal-cabecera">${n}</span>`).join("")}
      ${celdas.join("")}
    </div>
    <div class="tarjeta" style="margin-top:20px">
      <p class="med-dato" style="margin:0">${cumplimiento}</p>
    </div>
    <div class="tarjeta">
      <p class="leyenda"><span class="muestra cal-ok">✓</span> Todas las tomas registradas</p>
      <p class="leyenda"><span class="muestra cal-parcial">!</span> Algunas sin registrar u omitidas</p>
      <p class="leyenda"><span class="muestra cal-falla">✕</span> Ninguna registrada</p>
      <p class="leyenda"><span class="muestra cal-pendiente"></span> Pendiente</p>
    </div>`;

  document.getElementById("volver").onclick = pantallaInicio;
  document.getElementById("mes-anterior").onclick = () => {
    const d = new Date(anio, mes - 1, 1);
    pantallaHistorial(d.getFullYear(), d.getMonth());
  };
  document.getElementById("mes-siguiente").onclick = () => {
    const d = new Date(anio, mes + 1, 1);
    pantallaHistorial(d.getFullYear(), d.getMonth());
  };
  document.querySelectorAll("[data-dia]").forEach((b) => {
    b.onclick = () => pantallaDia(b.dataset.dia);
  });
}

async function pantallaDia(fecha) {
  entrarEn("dia");
  let medicamentos, tomas;
  try {
    [medicamentos, tomas] = await Promise.all([DB.listar(), DB.listarTomasDeFecha(fecha)]);
  } catch (e) {
    return mostrarErrorGeneral();
  }
  if (pantallaActual !== "dia") return;

  const dosis = Agenda.dosisDelDia(medicamentos, tomas, fecha, new Date());
  const r = Agenda.resumenDia(dosis);
  const contenido = dosis.length === 0
    ? `<div class="tarjeta"><p>No había tomas programadas este día.</p></div>`
    : dosis.map((d) => tarjetaDosis(d, false)).join("");

  app().innerHTML = `
    <button class="volver" id="volver">← Volver</button>
    <h1 style="font-size:28px">${fechaLarga(fecha)}</h1>
    <p class="fecha"><strong>${r.tomadas} de ${r.total}</strong> tomas registradas</p>
    ${contenido}
    ${fecha === hoyISO() ? `<button class="boton" id="ir-hoy">IR A HOY</button>` : ""}`;

  document.getElementById("volver").onclick = () =>
    pantallaHistorial(mesVisible ? mesVisible.anio : undefined, mesVisible ? mesVisible.mes : undefined);
  const irHoy = document.getElementById("ir-hoy");
  if (irHoy) irHoy.onclick = pantallaHoy;
}
