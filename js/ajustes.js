// Mediclic - Ajustes y copias de seguridad.

// ---------- Configuración guardada en el teléfono ----------
const Config = (() => {
  const CLAVE = "mediclic_config";
  const POR_DEFECTO = { escala: 1, sonido: true, vibrar: true, posponerMin: 10 };

  function leer() {
    try {
      const guardado = JSON.parse(localStorage.getItem(CLAVE) || "{}");
      return Object.assign({}, POR_DEFECTO, guardado);
    } catch (e) {
      return Object.assign({}, POR_DEFECTO);
    }
  }

  function aplicar() {
    document.documentElement.style.setProperty("--escala", String(leer().escala));
  }

  return {
    get: (clave) => leer()[clave],
    set: (clave, valor) => {
      const actual = leer();
      actual[clave] = valor;
      try { localStorage.setItem(CLAVE, JSON.stringify(actual)); } catch (e) { /* sin guardar */ }
      aplicar();
    },
    aplicar
  };
})();

// ---------- Validación de copias ----------
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function validarCopia(c) {
  if (!c || c.app !== "mediclic") return "Este archivo no es una copia de Mediclic.";
  if (!Array.isArray(c.medicamentos) || !Array.isArray(c.tomas)) return "La copia está incompleta.";

  for (const m of c.medicamentos) {
    const fechaFinOk = m && (m.fechaFin === undefined || m.fechaFin === "" ||
      (typeof m.fechaFin === "string" && FORMATO_FECHA.test(m.fechaFin)));
    if (!m || typeof m.id !== "string" || !m.id ||
        typeof m.nombre !== "string" || typeof m.dosis !== "string" ||
        !Array.isArray(m.horarios) || m.horarios.length === 0 ||
        !m.horarios.every((h) => typeof h === "string" && FORMATO_HORA.test(h)) ||
        !["todos", "algunos"].includes(m.frecuencia) ||
        !Array.isArray(m.dias) || !m.dias.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) ||
        typeof m.fechaInicio !== "string" || !FORMATO_FECHA.test(m.fechaInicio) ||
        !fechaFinOk) {
      return "La copia tiene un medicamento con datos inválidos.";
    }
  }
  for (const t of c.tomas) {
    if (!t || typeof t.id !== "string" || !t.id ||
        typeof t.fecha !== "string" || !FORMATO_FECHA.test(t.fecha) ||
        typeof t.horaProgramada !== "string" || !FORMATO_HORA.test(t.horaProgramada) ||
        !["tomado", "omitido", "pospuesto"].includes(t.estado)) {
      return "La copia tiene un registro de toma con datos inválidos.";
    }
  }
  return "";
}

// Se copian solo los campos conocidos (nada más entra a la base de datos).
function limpiarMedicamento(m) {
  return {
    id: m.id,
    nombre: m.nombre,
    dosis: m.dosis,
    horarios: [...m.horarios],
    frecuencia: m.frecuencia,
    dias: [...m.dias],
    fechaInicio: m.fechaInicio,
    fechaFin: m.fechaFin || "",
    medico: typeof m.medico === "string" ? m.medico : "",
    observaciones: typeof m.observaciones === "string" ? m.observaciones : ""
  };
}

function limpiarToma(t) {
  return {
    id: t.id,
    medId: typeof t.medId === "string" ? t.medId : "",
    nombre: typeof t.nombre === "string" ? t.nombre : "",
    dosis: typeof t.dosis === "string" ? t.dosis : "",
    fecha: t.fecha,
    horaProgramada: t.horaProgramada,
    horaReal: typeof t.horaReal === "string" ? t.horaReal : null,
    estado: t.estado,
    pospuestaHasta: Number(t.pospuestaHasta) || 0,
    veces: Number(t.veces) || 0
  };
}

// ---------- Exportar ----------
async function exportarCopia() {
  const datos = await DB.exportarTodo();
  const copia = {
    app: "mediclic",
    version: 1,
    exportadoEn: new Date().toISOString(),
    medicamentos: datos.medicamentos,
    tomas: datos.tomas
  };
  const nombre = `mediclic-copia-${hoyISO()}.json`;
  const archivo = new File([JSON.stringify(copia, null, 2)], nombre, { type: "application/json" });

  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: "Copia de seguridad de Mediclic" });
      return "Copia lista. Guardala en un lugar seguro (por ejemplo, en tu correo o en la nube).";
    } catch (e) {
      if (e && e.name === "AbortError") return "Cancelaste el guardado de la copia.";
      // si falla compartir, se prueba la descarga directa
    }
  }
  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return `Se descargó el archivo ${nombre}.`;
}

// ---------- Pantalla: ajustes ----------
function botonOpcion(clave, valor, texto, actual) {
  const activa = JSON.stringify(valor) === JSON.stringify(actual);
  return `<button type="button" class="opcion ${activa ? "activa" : ""}" data-clave="${clave}" data-valor='${JSON.stringify(valor)}' aria-pressed="${activa}">${texto}</button>`;
}

function pantallaAjustes(mensaje, esError) {
  entrarEn("ajustes");
  const notif = Sonido.estadoNotificaciones();
  const textoNotif = {
    granted: "Activados",
    denied: "Bloqueados. Se cambian desde los ajustes del teléfono.",
    default: "Sin activar",
    "no-disponible": "No disponibles en este teléfono"
  }[notif];

  const botonNotif = notif === "default"
    ? `<button class="boton boton-secundario" id="notif">ACTIVAR AVISOS DEL SISTEMA</button>`
    : notif === "granted"
      ? `<button class="boton boton-secundario" id="notif-prueba">ENVIAR AVISO DE PRUEBA</button>`
      : "";

  const enApp = typeof Nativo !== "undefined" && Nativo.disponible();
  const tarjetaAvisos = enApp ? `
    <div class="tarjeta" id="bloque-nativo">
      <h2>Alarmas del teléfono</h2>
      <p class="med-dato" id="nat-estado">Revisando…</p>
      <div id="nat-botones"></div>
      <p class="nota">Para que suenen siempre, en los ajustes del teléfono entrá a Aplicaciones → Mediclic → Batería y elegí "Sin restricciones" (los nombres pueden cambiar según el modelo). Abrí Mediclic al menos una vez por semana para renovar los avisos.</p>
    </div>` : `
    <div class="tarjeta">
      <h2>Avisos del sistema</h2>
      <p class="med-dato">Estado: ${textoNotif}</p>
      ${botonNotif}
      <p class="nota">Mediclic avisa con sonido y pantalla de alarma mientras está abierta. Los avisos del sistema ayudan si la dejaste en segundo plano, pero esta versión web no puede garantizar alarmas con la app cerrada.</p>
    </div>`;

  app().innerHTML = `
    <button class="volver" id="volver">← Volver</button>
    <h1>Ajustes</h1>
    <div style="height:16px"></div>

    <div class="tarjeta">
      <h2>Tamaño de las letras</h2>
      <div class="opciones">
        ${botonOpcion("escala", 1, "Normal", Config.get("escala"))}
        ${botonOpcion("escala", 1.15, "Grande", Config.get("escala"))}
        ${botonOpcion("escala", 1.3, "Muy grande", Config.get("escala"))}
      </div>
    </div>

    <div class="tarjeta">
      <h2>Alarma</h2>
      <p class="med-dato">Sonido</p>
      <div class="opciones">
        ${botonOpcion("sonido", true, "Sí", Config.get("sonido"))}
        ${botonOpcion("sonido", false, "No", Config.get("sonido"))}
      </div>
      <p class="med-dato" style="margin-top:16px">Vibración</p>
      <div class="opciones">
        ${botonOpcion("vibrar", true, "Sí", Config.get("vibrar"))}
        ${botonOpcion("vibrar", false, "No", Config.get("vibrar"))}
      </div>
      <p class="med-dato" style="margin-top:16px">Posponer</p>
      <div class="opciones">
        ${botonOpcion("posponerMin", 5, "5 min", Config.get("posponerMin"))}
        ${botonOpcion("posponerMin", 10, "10 min", Config.get("posponerMin"))}
        ${botonOpcion("posponerMin", 15, "15 min", Config.get("posponerMin"))}
      </div>
      <button class="boton boton-secundario" id="probar">PROBAR SONIDO</button>
      <p class="nota">El sonido solo funciona después de que tocás la pantalla. La vibración no está disponible en iPhone.</p>
    </div>

    ${tarjetaAvisos}

    <div class="tarjeta">
      <h2>Copia de seguridad</h2>
      <p class="med-dato">Guardá tus medicamentos y tu historial en un archivo, por si cambiás de teléfono.</p>
      <button class="boton" id="exportar">GUARDAR COPIA</button>
      <button class="boton boton-secundario" id="importar">RESTAURAR COPIA</button>
      <input type="file" id="archivo-copia" accept="application/json,.json" hidden>
      ${mensaje ? `<div class="${esError ? "error" : "exito"}" role="status">${esc(mensaje)}</div>` : ""}
    </div>

    <div class="tarjeta">
      <h2>Importante</h2>
      <p class="med-dato">Mediclic es una herramienta de organización y recordatorio. No reemplaza a tu médico ni a tu farmacéutico, no recomienda medicamentos ni cambia dosis. Cargá siempre los datos según las indicaciones de tu profesional de salud.</p>
    </div>`;

  document.getElementById("volver").onclick = pantallaInicio;

  document.querySelectorAll(".opcion").forEach((b) => {
    b.onclick = () => {
      Config.set(b.dataset.clave, JSON.parse(b.dataset.valor));
      pantallaAjustes();
    };
  });

  document.getElementById("probar").onclick = () => {
    Sonido.desbloquear();
    Sonido.pitido();
    Sonido.vibrar();
  };

  const botonPermiso = document.getElementById("notif");
  if (botonPermiso) {
    botonPermiso.onclick = async () => {
      await Sonido.pedirPermisoNotificaciones();
      pantallaAjustes();
    };
  }
  const botonPrueba = document.getElementById("notif-prueba");
  if (botonPrueba) {
    botonPrueba.onclick = () => Sonido.notificar("Mediclic", "Este es un aviso de prueba.", "prueba");
  }

  document.getElementById("exportar").onclick = async () => {
    try {
      const texto = await exportarCopia();
      pantallaAjustes(texto, false);
    } catch (e) {
      pantallaAjustes("No se pudo guardar la copia. Probá de nuevo.", true);
    }
  };

  if (enApp) rellenarBloqueNativo();

  const selector = document.getElementById("archivo-copia");
  document.getElementById("importar").onclick = () => selector.click();
  selector.onchange = async () => {
    const archivo = selector.files && selector.files[0];
    if (!archivo) return;
    try {
      const copia = JSON.parse(await archivo.text());
      const error = validarCopia(copia);
      if (error) return pantallaAjustes(error, true);
      pantallaConfirmarImportar(copia);
    } catch (e) {
      pantallaAjustes("No se pudo leer el archivo. Elegí una copia de Mediclic.", true);
    }
  };
}

async function rellenarBloqueNativo() {
  const permisos = await Nativo.estadoPermisos();
  if (pantallaActual !== "ajustes" || !permisos) return;
  const programados = Nativo.estado();
  const si = (v) => (v === "granted" ? "Sí" : v === "denied" ? "No" : "No se sabe");

  document.getElementById("nat-estado").innerHTML = `
    Avisos permitidos: <strong>${si(permisos.notificaciones)}</strong><br>
    Alarmas exactas: <strong>${si(permisos.exacta)}</strong><br>
    Avisos programados (próximos 7 días): <strong>${programados.cantidad}</strong>
    ${programados.motivo && programados.motivo !== "sin-permiso" ? `<br><span style="color:#B3261E">${esc(programados.motivo)}</span>` : ""}`;

  let botones = "";
  if (permisos.notificaciones !== "granted") {
    botones += `<button class="boton" id="nat-permiso">PERMITIR AVISOS</button>`;
  }
  if (permisos.exacta === "denied") {
    botones += `<button class="boton" id="nat-exacta">PERMITIR ALARMAS EXACTAS</button>`;
  }
  botones += `<button class="boton boton-secundario" id="nat-prueba">PROBAR AVISO EN 1 MINUTO</button>
              <div id="nat-mensaje"></div>`;
  document.getElementById("nat-botones").innerHTML = botones;

  const permiso = document.getElementById("nat-permiso");
  if (permiso) {
    permiso.onclick = async () => {
      await Nativo.pedirPermisos();
      Nativo.pedirReprogramar(0);
      setTimeout(() => pantallaAjustes(), 600);
    };
  }
  const exacta = document.getElementById("nat-exacta");
  if (exacta) exacta.onclick = () => Nativo.abrirAjusteAlarmaExacta();
  document.getElementById("nat-prueba").onclick = async () => {
    const ok = await Nativo.probarAviso();
    document.getElementById("nat-mensaje").innerHTML = ok
      ? `<div class="exito">Listo. Cerrá Mediclic y esperá 1 minuto: tiene que sonar el aviso.</div>`
      : `<div class="error">No se pudo programar la prueba. Revisá los permisos.</div>`;
  };
}

function pantallaConfirmarImportar(copia) {
  entrarEn("importar");
  app().innerHTML = `
    <h1>¿Restaurar la copia?</h1>
    <div class="tarjeta">
      <p>La copia tiene <strong>${copia.medicamentos.length}</strong> medicamento(s) y <strong>${copia.tomas.length}</strong> registro(s) de tomas.</p>
      <p class="aviso">Esto <strong>reemplaza</strong> todo lo que tenés cargado ahora en este teléfono.</p>
      <button class="boton boton-peligro" id="si">SÍ, RESTAURAR</button>
      <button class="boton boton-secundario" id="no">NO, VOLVER</button>
    </div>`;
  document.getElementById("no").onclick = () => pantallaAjustes();
  document.getElementById("si").onclick = async () => {
    document.getElementById("si").disabled = true;
    try {
      await DB.reemplazarTodo(
        copia.medicamentos.map(limpiarMedicamento),
        copia.tomas.map(limpiarToma)
      );
    } catch (e) {
      return pantallaAjustes("No se pudo restaurar la copia. No se cambió nada.", true);
    }
    pantallaAjustes(`Copia restaurada: ${copia.medicamentos.length} medicamento(s).`, false);
  };
}
