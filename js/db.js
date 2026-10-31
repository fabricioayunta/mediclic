// Mediclic - Base de datos local (IndexedDB).
// Todo el acceso a los datos pasa por este archivo.
const DB = (() => {
  const NOMBRE = "mediclic";
  const VERSION = 2;
  let conexion = null;

  function abrir() {
    if (conexion) return Promise.resolve(conexion);
    return new Promise((resolve, reject) => {
      const pedido = indexedDB.open(NOMBRE, VERSION);
      pedido.onupgradeneeded = () => {
        const db = pedido.result;
        if (!db.objectStoreNames.contains("medicamentos")) {
          db.createObjectStore("medicamentos", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("tomas")) {
          const tomas = db.createObjectStore("tomas", { keyPath: "id" });
          tomas.createIndex("fecha", "fecha", { unique: false });
        }
      };
      pedido.onsuccess = () => {
        conexion = pedido.result;
        resolve(conexion);
      };
      pedido.onerror = () => reject(pedido.error);
    });
  }

  // Si corre dentro de la app Android, se vuelven a programar los avisos del teléfono.
  function huboCambio() {
    try {
      if (typeof Nativo !== "undefined") Nativo.pedirReprogramar();
    } catch (e) { /* nada */ }
  }

  async function operar(almacenNombre, modo, accion) {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(almacenNombre, modo);
      const almacen = tx.objectStore(almacenNombre);
      const pedido = accion(almacen);
      tx.oncomplete = () => resolve(pedido ? pedido.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  // Guarda el estado de una dosis: "tomado", "omitido" o "pospuesto".
  // El id (medicamento + fecha + horario) es único: una dosis que ya quedó
  // "tomado" u "omitido" NO se puede registrar de nuevo.
  async function guardarEstado(registro) {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("tomas", "readwrite");
      const almacen = tx.objectStore("tomas");
      const resultado = { repetida: false };
      const lectura = almacen.get(registro.id);
      lectura.onsuccess = () => {
        const previo = lectura.result;
        if (previo && (previo.estado === "tomado" || previo.estado === "omitido")) {
          resultado.repetida = true;
          return;
        }
        const nuevo = Object.assign({}, registro);
        const vecesPrevias = previo ? previo.veces || 0 : 0;
        nuevo.veces = registro.estado === "pospuesto" ? vecesPrevias + 1 : vecesPrevias;
        almacen.put(nuevo);
      };
      tx.oncomplete = () => resolve(resultado);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  // Copia de seguridad: lee y reemplaza todo en una sola transacción.
  async function exportarTodo() {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["medicamentos", "tomas"], "readonly");
      const meds = tx.objectStore("medicamentos").getAll();
      const tomas = tx.objectStore("tomas").getAll();
      tx.oncomplete = () => resolve({ medicamentos: meds.result, tomas: tomas.result });
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function reemplazarTodo(medicamentos, tomas) {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["medicamentos", "tomas"], "readwrite");
      const almMeds = tx.objectStore("medicamentos");
      const almTomas = tx.objectStore("tomas");
      almMeds.clear();
      almTomas.clear();
      medicamentos.forEach((m) => almMeds.put(m));
      tomas.forEach((t) => almTomas.put(t));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    // Medicamentos
    listar: () => operar("medicamentos", "readonly", (a) => a.getAll()),
    obtener: (id) => operar("medicamentos", "readonly", (a) => a.get(id)),
    guardar: async (medicamento) => {
      const r = await operar("medicamentos", "readwrite", (a) => a.put(medicamento));
      huboCambio();
      return r;
    },
    eliminar: async (id) => {
      const r = await operar("medicamentos", "readwrite", (a) => a.delete(id));
      huboCambio();
      return r;
    },
    nuevoId: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    // Tomas
    guardarEstado: async (registro) => {
      const r = await guardarEstado(registro);
      huboCambio();
      return r;
    },
    borrarToma: async (id) => {
      const r = await operar("tomas", "readwrite", (a) => a.delete(id));
      huboCambio();
      return r;
    },
    listarTomasDeFecha: (fecha) =>
      operar("tomas", "readonly", (a) => a.index("fecha").getAll(fecha)),
    listarTomasEntre: (desde, hasta) =>
      operar("tomas", "readonly", (a) =>
        a.index("fecha").getAll(IDBKeyRange.bound(desde, hasta))
      ),
    // Copias de seguridad
    exportarTodo,
    reemplazarTodo: async (medicamentos, tomas) => {
      await reemplazarTodo(medicamentos, tomas);
      huboCambio();
    }
  };
})();
