// Mediclic - Lógica de horarios y dosis del día.
// No toca la pantalla ni la base de datos: solo calcula.
const Agenda = (() => {
  // Se puede confirmar una dosis desde este margen antes de su hora
  // (evita toques accidentales en tomas que están lejos).
  const MARGEN_ANTICIPO_MIN = 60;
  // Si se abre la app tarde, la alarma suena solo para dosis vencidas hace menos de esto.
  const VENTANA_ALARMA_MIN = 90;

  function idToma(medId, fecha, hora) {
    return `${medId}|${fecha}|${hora}`;
  }

  function fechaLocalISO(d) {
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mes}-${dia}`;
  }

  function partesFecha(fechaISO) {
    return fechaISO.split("-").map(Number);
  }

  function diaDeSemana(fechaISO) {
    const [a, m, d] = partesFecha(fechaISO);
    return new Date(a, m - 1, d).getDay(); // 0 = domingo
  }

  function aplicaEnFecha(med, fechaISO) {
    if (fechaISO < med.fechaInicio) return false;
    if (med.fechaFin && fechaISO > med.fechaFin) return false;
    if (med.frecuencia === "todos") return true;
    return med.dias.includes(diaDeSemana(fechaISO));
  }

  function momentoDosis(fechaISO, hora) {
    const [a, m, d] = partesFecha(fechaISO);
    const [h, mi] = hora.split(":").map(Number);
    return new Date(a, m - 1, d, h, mi).getTime();
  }

  // Estados de una dosis:
  //   "tomado":    la persona confirmó que la tomó.
  //   "omitido":   la persona indicó que no la va a tomar.
  //   "pospuesto": se pidió un aviso más tarde y todavía no llegó esa hora.
  //   "vencida":   pasó el horario y no hay registro (NUNCA se marca sola como tomada).
  //   "pendiente": todavía no llegó el horario.
  function dosisDelDia(medicamentos, tomas, fechaISO, ahora) {
    const hoy = fechaLocalISO(ahora);
    const ahoraMs = ahora.getTime();
    const registradas = new Map(tomas.map((t) => [t.id, t]));
    const vistas = new Set();
    const lista = [];

    medicamentos
      .filter((m) => aplicaEnFecha(m, fechaISO))
      .forEach((m) => {
        m.horarios.forEach((hora) => {
          const id = idToma(m.id, fechaISO, hora);
          vistas.add(id);
          const toma = registradas.get(id);
          const momento = momentoDosis(fechaISO, hora);

          let estado;
          let hasta = 0;
          if (toma && toma.estado === "tomado") {
            estado = "tomado";
          } else if (toma && toma.estado === "omitido") {
            estado = "omitido";
          } else {
            hasta = toma && toma.estado === "pospuesto" ? Number(toma.pospuestaHasta) || 0 : 0;
            if (hasta > ahoraMs) estado = "pospuesto";
            else estado = momento < ahoraMs ? "vencida" : "pendiente";
          }

          const enHoy = fechaISO === hoy;
          const minutosQueFaltan = (momento - ahoraMs) / 60000;
          const puedeConfirmar =
            enHoy &&
            (estado === "vencida" ||
              estado === "pospuesto" ||
              (estado === "pendiente" && minutosQueFaltan <= MARGEN_ANTICIPO_MIN));
          const desde = Math.max(momento, hasta);
          const debeSonar =
            enHoy && estado === "vencida" && ahoraMs - desde <= VENTANA_ALARMA_MIN * 60000;

          lista.push({
            id,
            medId: m.id,
            nombre: m.nombre,
            dosis: m.dosis,
            hora,
            fecha: fechaISO,
            estado,
            horaReal: toma ? toma.horaReal || null : null,
            pospuestaHasta: estado === "pospuesto" ? hasta : 0,
            veces: toma ? toma.veces || 0 : 0,
            puedeConfirmar,
            debeSonar,
            claveAlarma: `${id}|${hasta}`
          });
        });
      });

    // Registros reales que ya no coinciden con la agenda actual
    // (por ejemplo, si se cambió el horario o se eliminó el medicamento después de tomarlo).
    tomas.forEach((t) => {
      if (vistas.has(t.id)) return;
      if (t.estado !== "tomado" && t.estado !== "omitido") return;
      lista.push({
        id: t.id,
        medId: t.medId,
        nombre: t.nombre,
        dosis: t.dosis,
        hora: t.horaProgramada,
        fecha: fechaISO,
        estado: t.estado,
        horaReal: t.horaReal || null,
        pospuestaHasta: 0,
        veces: t.veces || 0,
        puedeConfirmar: false,
        debeSonar: false,
        claveAlarma: "",
        huerfana: true
      });
    });

    lista.sort((a, b) => a.hora.localeCompare(b.hora) || a.nombre.localeCompare(b.nombre, "es"));
    return lista;
  }

  // Resumen de un día para el calendario.
  //   ok:        todas tomadas
  //   parcial:   alguna tomada y alguna omitida o sin registrar
  //   falla:     ninguna tomada y alguna omitida o sin registrar
  //   pendiente: no hay omitidas ni vencidas, pero faltan tomas
  //   vacio:     no hay tomas programadas
  function resumenDia(dosis) {
    const r = { total: dosis.length, tomadas: 0, omitidas: 0, vencidas: 0, pendientes: 0 };
    dosis.forEach((d) => {
      if (d.estado === "tomado") r.tomadas++;
      else if (d.estado === "omitido") r.omitidas++;
      else if (d.estado === "vencida") r.vencidas++;
      else r.pendientes++;
    });
    if (r.total === 0) r.estado = "vacio";
    else if (r.tomadas === r.total) r.estado = "ok";
    else if (r.omitidas + r.vencidas > 0) r.estado = r.tomadas > 0 ? "parcial" : "falla";
    else r.estado = "pendiente";
    return r;
  }

  return {
    dosisDelDia, resumenDia, idToma, fechaLocalISO, aplicaEnFecha, momentoDosis,
    MARGEN_ANTICIPO_MIN, VENTANA_ALARMA_MIN
  };
})();

if (typeof module !== "undefined") module.exports = Agenda;
