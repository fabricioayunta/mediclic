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

  // Registra una toma. El id (medicamento + fecha + horario) es único,
  // así que una misma dosis NO se puede registrar dos veces.
  async function registrarToma(toma) {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("tomas", "readwrite");
      const pedido = tx.objectStore("tomas").add(toma);
      let repetida = false;
      pedido.onerror = (evento) => {
        if (pedido.error && pedido.error.name === "ConstraintError") {
          repetida = true;
          evento.preventDefault();
        }
      };
      tx.oncomplete = () => resolve({ repetida });
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    // Medicamentos
    listar: () => operar("medicamentos", "readonly", (a) => a.getAll()),
    obtener: (id) => operar("medicamentos", "readonly", (a) => a.get(id)),
    guardar: (medicamento) => operar("medicamentos", "readwrite", (a) => a.put(medicamento)),
    eliminar: (id) => operar("medicamentos", "readwrite", (a) => a.delete(id)),
    nuevoId: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    // Tomas
    registrarToma,
    listarTomasDeFecha: (fecha) =>
      operar("tomas", "readonly", (a) => a.index("fecha").getAll(fecha))
  };
})();
