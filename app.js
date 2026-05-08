// ========================================
// ARCHIVO: app.js
// ========================================
const cron = require('node-cron');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

// ----------------------------------------
// Ruta al template HTML de email
// ----------------------------------------
const TEMPLATE_PATH = path.join(__dirname, 'email_template.html');

// Configuración de la base de datos
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Configuración del transportador de email
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // true para puerto 465, false para otros
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// ----------------------------------------
// Carga el template HTML desde archivo
// Lanza un error si el archivo no existe
// ----------------------------------------
function cargarTemplate() {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`No se encontró el archivo de template: ${TEMPLATE_PATH}`);
  }
  return fs.readFileSync(TEMPLATE_PATH, 'utf8');
}

// ----------------------------------------
// Reemplaza las variables {{clave}} en el template
// usando los datos del objeto 'variables'
// ----------------------------------------
function aplicarVariables(template, variables) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, clave) => {
    if (Object.prototype.hasOwnProperty.call(variables, clave)) {
      return variables[clave] ?? '';
    }
    // Si la variable no existe en los datos, se deja en blanco y se avisa
    console.warn(`  ⚠ Variable no encontrada en descripcion: {{${clave}}}`);
    return '';
  });
}

// ----------------------------------------
// Parsea el campo 'descripcion' como JSON.
// Si no es JSON válido, devuelve un objeto
// con la clave 'descripcion' como fallback.
// ----------------------------------------
function parsearDescripcion(descripcion) {
  try {
    const parsed = JSON.parse(descripcion);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    throw new Error('No es un objeto JSON');
  } catch {
    console.warn('  ⚠ El campo descripcion no es JSON válido. Se usará como texto plano.');
    return { descripcion: descripcion || '' };
  }
}

// Función para obtener registros pendientes
async function obtenerRegistrosPendientes() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    const [rows] = await connection.execute(`
      SELECT id, novedad, descripcion, fecha_inicio, fecha_fin, icono, 
             habilitado, id_usuario, createdAt, updatedAt, forzar_visualizacion, 
             link, imagen, email, email_enviado, usuario
      FROM lst_novedades_email_enviar
    `);

    return rows;
  } catch (error) {
    console.error('Error al obtener registros:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

// ----------------------------------------
// Función para generar HTML del email
// Lee el template y reemplaza variables
// con los datos del campo 'descripcion'
// ----------------------------------------
function generarHTMLEmail(registro) {
  // Cargar template desde archivo
  const template = cargarTemplate();

  // Parsear descripcion como JSON para obtener las variables
  const variables = parsearDescripcion(registro.descripcion);

  // Aplicar variables del campo descripcion al template
  const html = aplicarVariables(template, variables);

  return html;
}

// Función para enviar email
async function enviarEmail(registro) {
  let htmlBody;

  try {
    htmlBody = generarHTMLEmail(registro);
  } catch (error) {
    console.error(`  ✗ Error al generar HTML para registro ${registro.id}:`, error.message);
    return false;
  }

  const mailOptions = {
    from: `"Performance Eficiencia y Mejora" <${process.env.EMAIL_USER || 'PEM@personal.com.ar'}>`,
    to: registro.email,
    cc: `erjuarez@personal.com.ar`,
    // cc: `ERJUAREZ@TECO.COM.AR , AOSCHUST@TECO.COM.AR`,
    // cc: `MARENDE@TECO.COM.AR , ERJUAREZ@TECO.COM.AR , NMONCHIETTI@TECO.COM.AR , PARCIDIACONO@TECO.COM.AR , SAMARQUEZ@TECO.COM.AR , LFREVILLA@TECO.COM.AR , PDALVAREZ@TECO.COM.AR , AOSCHUST@TECO.COM.AR`,

    subject: `Novedad: ${registro.novedad}`,
    html: htmlBody
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`  ✓ Email enviado a ${registro.email}. Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`  ✗ Error al enviar email a ${registro.email}:`, error);
    return false;
  }
}

// Función para actualizar registro como enviado
async function actualizarEmailEnviado(id) {
  const connection = await mysql.createConnection(dbConfig);

  try {
    await connection.execute(
      'UPDATE pem_novedades SET email_enviado = 1 WHERE id = ?',
      [id]
    );
    console.log(`  ✓ Registro ${id} actualizado como enviado.`);
  } catch (error) {
    console.error(`  ✗ Error al actualizar registro ${id}:`, error);
    throw error;
  } finally {
    await connection.end();
  }
}

// Función principal que se ejecuta cada 15 segundos
async function procesarNovedades() {
  console.log(`[${new Date().toISOString()}] Iniciando proceso de verificación...`);

  try {
    const registros = await obtenerRegistrosPendientes();

    if (registros.length === 0) {
      console.log('No hay registros pendientes de envío.');
      return;
    }

    console.log(`Se encontraron ${registros.length} registro(s) pendiente(s).`);

    for (const registro of registros) {
      console.log(`\nProcesando novedad ID: ${registro.id} - ${registro.novedad}`);

      const emailEnviado = await enviarEmail(registro);

      if (emailEnviado) {
        await actualizarEmailEnviado(registro.id);
      } else {
        console.log(`  ✗ No se pudo enviar el email para el registro ${registro.id}`);
      }
    }

    console.log('\nProceso completado.');
  } catch (error) {
    console.error('Error en el proceso:', error);
  }
}

// Verificar conexión al iniciar
async function verificarConexion() {
  try {
    const connection = await mysql.createConnection(dbConfig);
    console.log('✓ Conexión a la base de datos exitosa');
    await connection.end();

    await transporter.verify();
    console.log('✓ Configuración de email verificada');

    // Verificar que el template existe
    cargarTemplate();
    console.log(`✓ Template de email cargado: ${TEMPLATE_PATH}`);

    return true;
  } catch (error) {
    console.error('✗ Error en la configuración:', error.message);
    return false;
  }
}

// Iniciar aplicación
async function iniciar() {
  console.log('=================================');
  console.log('Sistema de Emails Automáticos');
  console.log('=================================\n');

  const conexionOk = await verificarConexion();

  if (!conexionOk) {
    console.error('No se puede iniciar el sistema. Revise la configuración.');
    process.exit(1);
  }

  // Ejecutar inmediatamente al iniciar
  console.log('\nEjecutando primera verificación...\n');
  await procesarNovedades();

  // Programar ejecución cada 15 segundos
  cron.schedule('*/15 * * * * *', async () => {
    await procesarNovedades();
  });

  console.log('\n✓ Sistema iniciado. Verificación cada 15 segundos.');
  console.log('Presione Ctrl+C para detener.\n');
}

// Manejo de errores y cierre
process.on('SIGINT', () => {
  console.log('\n\nDeteniendo el sistema...');
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  console.error('Error no manejado:', error);
});

// Iniciar la aplicación
iniciar();
