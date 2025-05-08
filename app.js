import express from 'express'; // Importa el framework Express para crear la API
import fs from 'fs'; // Importa el módulo de sistema de archivos de Node.js
import csv from 'csv-parser'; // Importa el módulo para leer archivos CSV

const app = express(); // Crea una instancia de una aplicación Express
const PORT = 7050; // Define el puerto en el que correrá el servidor
app.use(express.json()); // Middleware para poder leer datos JSON en requests

let datos = []; // Array donde se almacenarán los datos leídos del CSV
let columnas = []; // Array para guardar los nombres de las columnas del CSV

// Leer el archivo CSV al iniciar el servidor
fs.createReadStream('./data/VentasProductosSupermercados.csv') // Crea un stream de lectura desde el archivo CSV
  .pipe(csv()) // Pasa el stream por el parser CSV
  .on('data', (row) => { // Por cada fila leída del CSV...
    const fila = {};

    for (let clave in row) {
      const valor = row[clave].trim(); // Quita espacios al inicio y final

      if (clave === 'indice_tiempo') {
        // Si la clave es 'indice_tiempo', intenta convertir la fecha de MM/DD/YYYY a YYYY-MM-DD
        const partes = valor.split('/');
        if (partes.length === 3) {
          const [mes, dia, anio] = partes;
          fila[clave] = `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
        } else {
          fila[clave] = valor; // Si ya está en formato correcto, lo deja igual
        }
      } else {
        const num = parseFloat(valor); // Intenta convertir el valor a número
        fila[clave] = isNaN(num) ? valor : Math.round(num); // Si no es número, deja el texto; si es número, lo redondea
      }
    }

    datos.push(fila); // Agrega la fila procesada al array de datos
  })
  .on('end', () => {
    console.log('CSV cargado correctamente');
    if (datos.length > 0) {
      columnas = Object.keys(datos[0]); // Guarda los nombres de las columnas usando la primera fila
    }
  });

// Endpoint 1: Devuelve las ventas de un producto a lo largo del tiempo
app.get('/producto/:nombre', (req, res) => {
  const nombre = req.params.nombre; // Obtiene el nombre del producto desde la URL
  if (!columnas.includes(nombre)) {
    return res.status(404).json({ error: 'Producto no encontrado' }); // Si el producto no existe, error
  }

  // Crea un array con la fecha y las ventas para ese producto
  const resultado = datos.map(row => ({
    fecha: row.indice_tiempo,
    ventas: row[nombre]
  }));

  res.json({ producto: nombre, ventas: resultado }); // Devuelve el resultado como JSON
});

// Endpoint 2: Devuelve la cantidad de ventas por medio de pago en una fecha específica
app.get('/ventas/:fecha/:medio_pago', (req, res) => {
  const { fecha, medio_pago } = req.params;

  if (!columnas.includes(medio_pago)) { //Verifica si ese medio de pago existe en los datos.
    return res.status(404).json({ error: 'Medio de pago no encontrado' });
  }

  const fila = datos.find(row => row.indice_tiempo === fecha); // Busca en los datos una fila que coincida con la fecha solicitada y trae todos los datos.

  if (!fila) {
    return res.status(404).json({ error: 'Fecha no encontrada. Usá formato YYYY-MM-DD' });
  }

  res.json({
    fecha: fila.indice_tiempo, // Se usa con punto porque se sabe como se llama la propiedad .
    medio_pago,
    cantidad: fila[medio_pago] // Se usa [] porque no sabemos como se llama la propiedad.
  });
});

// Endpoint 3: Devuelve la fecha con mayor venta total
app.get('/mayor-venta', (req, res) => {
  let maxVenta = 0;
  let fechaMax = '';

    const columnasIgnorar = [
      'Ventas online',
      'Ventas salon',
      'Ventas efectivo',
      'Ventas tarjeta de debito',
      'Ventas tarjeta de credito',
      'Ventas totales',
      'indice_tiempo'
    ];

  datos.forEach(row => {

    const total = columnas.reduce((sum, col) => { // Reduce es una funcion que va acumulando un resultado y devuelve un unico valor
      if (!columnasIgnorar.includes(col) && typeof row[col] === 'number') {
        return sum + row[col];
      }
      return sum;
    }, 0);

    if (total > maxVenta) {
      maxVenta = total;
      fechaMax = row.indice_tiempo;
    }
  });

  res.json({ fecha: fechaMax, total_ventas: maxVenta });
});

// Endpoint 4: Devuelve la fecha con menor venta total
app.get('/menor-venta', (req, res) => {
  let minVenta = Infinity; // guardamos el numero mas grande en JavaScript
  let fechaMin = '';

  const columnasIgnorar = [
    'Ventas online',
    'Ventas salon',
    'Ventas efectivo',
    'Ventas tarjeta de debito',
    'Ventas tarjeta de credito',
    'Ventas totales',
    'indice_tiempo'
  ];

  datos.forEach(row => {

    const total = columnas.reduce((sum, col) => { // Reduce es una funcion que va acumulando un resultado y devuelve un unico valor
      if (!columnasIgnorar.includes(col) && typeof row[col] === 'number') {
        return sum + row[col];
      }
      return sum;
    }, 0);

    if (total < minVenta) {
      minVenta = total;
      fechaMin = row.indice_tiempo;
    }
  });

  res.json({ fecha: fechaMin, total_ventas: minVenta });
});

// Endpoint 5: Agrega una nueva fila al CSV
app.post('/crear', (req, res) => {
  const nuevaFila = req.body; // Lee la nueva fila desde el cuerpo del request

  // Verifica que venga el campo de fecha
  if (!nuevaFila.indice_tiempo) {
    return res.status(400).json({ error: 'Falta el campo "indice_tiempo"' });
  }

  // Verifica que no exista ya una fila con esa misma fecha
  if (datos.some(row => row.indice_tiempo === nuevaFila.indice_tiempo)) {
    return res.status(409).json({ error: 'Ya existe una fila con esa fecha' });
  }

  const filaCompleta = {}; // Crea un objeto vacío que representará la nueva fila completa

  for (const col of columnas) { // Recorre todas las columnas esperadas
    if (col === 'indice_tiempo') { // Si la columna es 'indice_tiempo' (la fecha)
      filaCompleta[col] = nuevaFila[col]; // Usa el valor enviado para la fecha
    } else { // Para todas las demás columnas
      if (typeof nuevaFila[col] === 'number') { // Si el valor es un número
        filaCompleta[col] = nuevaFila[col]; // Usa ese valor
      } else { // Si el valor no es un número
        filaCompleta[col] = 0; // Asigna 0
      }
    }
  }

  datos.push(filaCompleta); // Agrega la nueva fila a los datos en memoria

  // Prepara la fila en formato CSV para guardar en el archivo
  const filaCSV = columnas.map(col => filaCompleta[col]).join(',');

  // Agrega la nueva fila al final del archivo CSV
  fs.appendFile('./data/VentasProductosSupermercados.csv', `\n${filaCSV}`, err => {
    if (err) console.error('Error al guardar en CSV:', err);
  });

  // Responde con éxito
  res.status(201).json({ mensaje: 'Fila agregada correctamente', fila: filaCompleta });
});


// Endpoint 6: Elimina una fila por fecha
app.delete('/eliminar/:fecha', (req, res) => {
  const fecha = req.params.fecha;
  const index = datos.findIndex(row => row.indice_tiempo === fecha); // Busca la fila por fecha

  if (index === -1) {
    return res.status(404).json({ error: 'Fecha no encontrada. Usá el formato YYYY-MM-DD' });
  }

  const eliminada = datos.splice(index, 1)[0]; // Elimina la fila del array

  // Reconstruye el contenido del CSV sin la fila eliminada
  const nuevoContenidoCSV = [
    columnas.join(','), // encabezado
    ...datos.map(row => columnas.map(col => row[col]).join(',')) // filas restantes
  ].join('\n');

  // Escribe el nuevo contenido al archivo
  fs.writeFile('./data/VentasProductosSupermercados.csv', nuevoContenidoCSV, err => {
    if (err) {
      console.error('Error al escribir el archivo CSV:', err);
      return res.status(500).json({ error: 'Error al actualizar el archivo CSV' });
    }

    res.json({ mensaje: 'Fila eliminada correctamente', fila: eliminada });
  });
});


// Endpoint 7: Actualiza una fila existente por fecha
app.put('/actualizar/:fecha', (req, res) => {
  const fecha = req.params.fecha;
  const nuevaData = req.body;

  const index = datos.findIndex(row => row.indice_tiempo === fecha); // Busca el índice de la fila que tenga el campo indice_tiempo igual a la fecha buscada. Si no encuentra, devuelve -1
  if (index === -1) {
    return res.status(404).json({ error: 'Fecha no encontrada. Usá el formato YYYY-MM-DD' });
  }

  const filaExistente = datos[index]; //Obtenemos toda la fila que vamos a actualizar.
  const filaActualizada = {};

  for (const col of columnas) {
    if (col === 'indice_tiempo') {
      filaActualizada[col] = fecha; // No se permite cambiar la fecha
    } else {
      const nuevoValor = nuevaData[col];
      filaActualizada[col] = typeof nuevoValor === 'number' ? nuevoValor : filaExistente[col]; // Si no se envió el valor o no es numérico, mantiene el valor anterior.
    }
  }

  // Reemplaza la fila en memoria
  datos[index] = filaActualizada;

  // Escribe todo el array datos de nuevo en el CSV
  const csvContent = [
    columnas.join(','), // encabezado
    ...datos.map(row => columnas.map(col => row[col]).join(',')) // filas
  ].join('\n');

  fs.writeFile('./data/VentasProductosSupermercados.csv', csvContent, err => {
    if (err) {
      console.error('Error al actualizar el archivo CSV:', err);
      return res.status(500).json({ error: 'Error al escribir en el archivo CSV' });
    }

    res.json({ mensaje: 'Fila actualizada correctamente', fila: filaActualizada });
  });
});


// Inicia el servidor en el puerto indicado
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
