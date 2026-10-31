// Mediclic - Avisos reales del teléfono (solo dentro de la app Android).
// En el navegador este archivo no hace nada: Nativo.disponible() devuelve false.
//
// Idea: se programan en el sistema los avisos de los próximos días. Así suenan
// aunque Mediclic esté cerrada. Cada vez que se abre la app, o se cambia algo,
// se borran y se vuelven a programar con los datos actuales.
const Nativo = (() => {
  const CANAL = "mediclic-alarmas";
  const DIAS_ADELANTE = 7;               // hoy + 7 días
  const REPETICIONES_MIN = [0, 10, 20];  // aviso a la hora y recordatorios si nadie confirma
  const MAX_AVISOS = 300;                // Android limita la cantidad de alarmas por app
  const ID_PRUEBA = 1;

  let ocupado = false;
  let repetir = false;
  let temporizador = null;
  const estado = { cantidad: 0, motivo: "" };

  function plugin() {
    try {
      const c = window.Capacitor;
      if (c && typeof c.isNativePlatform === "function" && c.isNativePlatform() && c.Plugins) {
        return c.Plugins.LocalNotifications || null;
      }
    } catch (e) { /* nada */ }
    return null;
  }

  function disponible() {
    return plugin() !== null;
  }

  // Número estable (siempre el mismo para la misma dosis) para poder cancelarlo después.
  function idAviso(texto) {
    let h = 7;
    for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) | 0;
    return (Math.abs(h) % 2147480000) + 2;
  }

  async function pedirPermisos() {
    const LN = plugin();
    if (!LN) return "no-disponible";
    try {
      let p = await LN.checkPermissions();
      if (p.display === "prompt" || p.display === "prompt-with-rationale") {
        p = await LN.requestPermissions();
      }
      return p.display;
    } catch (e) {
      return "error";
    }
  }

  async function asegurarCanal(LN) {
    await LN.createChannel({
      id: CANAL,
      name: "Alarmas de medicación",
      description: "Avisos para tomar tus medicamentos",
      importance: 5,
      visibility: 1,
      vibration: true
    });
  }

  async function programarTodo(LN) {
    const permisos = await LN.checkPermissions();
    if (permisos.display !== "granted") {
      estado.cantidad = 0;
      estado.motivo = "sin-permiso";
      return;
    }
    await asegurarCanal(LN);

    const ahora = new Date();
    const ahoraMs = ahora.getTime();
    const desde = Agenda.fechaLocalISO(ahora);
    const limite = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + DIAS_ADELANTE);
    const hasta = Agenda.fechaLocalISO(limite);

    const [medicamentos, tomas] = await Promise.all([
      DB.listar(),
      DB.listarTomasEntre(desde, hasta)
    ]);
    const porFecha = {};
    tomas.forEach((t) => {
      (porFecha[t.fecha] = porFecha[t.fecha] || []).push(t);
    });

    const avisos = new Map();
    for (let i = 0; i <= DIAS_ADELANTE; i++) {
      const fecha = Agenda.fechaLocalISO(
        new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + i)
      );
      const dosis = Agenda.dosisDelDia(medicamentos, porFecha[fecha] || [], fecha, ahora);
      dosis.forEach((d) => {
        if (d.huerfana || d.estado === "tomado" || d.estado === "omitido") return;
        const base = d.estado === "pospuesto"
          ? d.pospuestaHasta
          : Agenda.momentoDosis(fecha, d.hora);
        REPETICIONES_MIN.forEach((minutos, k) => {
          const cuando = base + minutos * 60000;
          if (cuando <= ahoraMs + 5000) return; // solo avisos que todavía no pasaron
          const id = idAviso(`${d.id}|${k}`);
          avisos.set(id, {
            id,
            title: k === 0
              ? `Es hora de tomar tu medicamento: ${d.nombre}`
              : `Recordatorio: ${d.nombre}`,
            body: `Dosis registrada: ${d.dosis}. Hora: ${d.hora}.` +
              (k > 0 ? " Todavía no confirmaste la toma." : ""),
            channelId: CANAL,
            schedule: { at: new Date(cuando), allowWhileIdle: true },
            autoCancel: true,
            extra: { dosisId: d.id }
          });
        });
      });
    }

    const lista = [...avisos.values()]
      .sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime())
      .slice(0, MAX_AVISOS);

    // Se borran los avisos anteriores (menos el de prueba) y se programan los nuevos.
    const pendientes = await LN.getPending();
    const aBorrar = (pendientes.notifications || [])
      .filter((n) => n.id !== ID_PRUEBA)
      .map((n) => ({ id: n.id }));
    if (aBorrar.length) await LN.cancel({ notifications: aBorrar });
    if (lista.length) await LN.schedule({ notifications: lista });

    estado.cantidad = lista.length;
    estado.motivo = "";
  }

  async function reprogramar() {
    const LN = plugin();
    if (!LN) return;
    if (ocupado) {
      repetir = true;
      return;
    }
    ocupado = true;
    try {
      do {
        repetir = false;
        await programarTodo(LN);
      } while (repetir);
    } catch (e) {
      estado.motivo = "error: " + String((e && e.message) || e);
    } finally {
      ocupado = false;
    }
  }

  // Se espera un momento para juntar varios cambios seguidos en una sola programación.
  function pedirReprogramar(espera) {
    if (!disponible()) return;
    clearTimeout(temporizador);
    temporizador = setTimeout(reprogramar, espera === undefined ? 800 : espera);
  }

  async function iniciar() {
    if (!disponible()) return;
    await pedirPermisos();
    pedirReprogramar(0);
  }

  async function estadoPermisos() {
    const LN = plugin();
    if (!LN) return null;
    const r = { notificaciones: "desconocido", exacta: "desconocido" };
    try {
      r.notificaciones = (await LN.checkPermissions()).display;
    } catch (e) { /* nada */ }
    try {
      const e = await LN.checkExactNotificationSetting();
      r.exacta = e.exact_alarm || e.exactAlarm || "desconocido";
    } catch (e) { /* nada */ }
    return r;
  }

  async function abrirAjusteAlarmaExacta() {
    const LN = plugin();
    if (!LN) return;
    try { await LN.changeExactNotificationSetting(); } catch (e) { /* nada */ }
  }

  // Aviso de prueba en 1 minuto: sirve para comprobar que suena con la app cerrada.
  async function probarAviso() {
    const LN = plugin();
    if (!LN) return false;
    try {
      await asegurarCanal(LN);
      await LN.schedule({
        notifications: [{
          id: ID_PRUEBA,
          title: "Mediclic: aviso de prueba",
          body: "Si ves este aviso, las alarmas del teléfono funcionan.",
          channelId: CANAL,
          schedule: { at: new Date(Date.now() + 60000), allowWhileIdle: true },
          autoCancel: true
        }]
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  // Si la alarma ya se muestra dentro de la app, se limpian los avisos de esa dosis del panel.
  async function quitarAvisosDeDosis(dosisId) {
    const LN = plugin();
    if (!LN) return;
    try {
      await LN.removeDeliveredNotifications({
        notifications: REPETICIONES_MIN.map((m, k) => ({ id: idAviso(`${dosisId}|${k}`) }))
      });
    } catch (e) { /* nada */ }
  }

  return {
    disponible, iniciar, pedirPermisos, pedirReprogramar, estadoPermisos,
    abrirAjusteAlarmaExacta, probarAviso, quitarAvisosDeDosis,
    estado: () => ({ ...estado })
  };
})();
