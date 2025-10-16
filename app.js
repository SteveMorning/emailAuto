// ========================================
// ARCHIVO: app.js
// ========================================
const cron = require('node-cron');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');

require('dotenv').config();

// Configuración de la base de datos
const dbConfig = {
  host: process.env.DB_HOST ,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD ,
  database: process.env.DB_NAME ,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};



// Configuración del transportador de email
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ,
  port: process.env.SMTP_PORT,
  secure: false, // true para puerto 465, false para otros
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD 
  }
});
// const transporter = nodemailer.createTransport({
//   host: process.env.SMTP_HOST || 'smtp.gmail.com',
//   port: process.env.SMTP_PORT || 587,
//   secure: false, // true para puerto 465, false para otros
//   auth: {
//     user: process.env.EMAIL_USER || 'backoffice_ays@teco.com.ar',
//     pass: process.env.EMAIL_PASSWORD || 'tu_contraseña'
//   }
// });

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

// Función para enviar email
async function enviarEmail(registro) {
  const mailOptions = {
    from: `"Performance Eficiencia y Mejora" <${process.env.EMAIL_USER || 'PEM@teco.com.ar'}>`,
    to: registro.email,
    // cc: `erjuarez@teco.com.ar`,
    // cc: `ERJUAREZ@TECO.COM.AR , AOSCHUST@TECO.COM.AR`,
    cc: `MARENDE@TECO.COM.AR , ERJUAREZ@TECO.COM.AR , NMONCHIETTI@TECO.COM.AR , PARCIDIACONO@TECO.COM.AR , SAMARQUEZ@TECO.COM.AR , LFREVILLA@TECO.COM.AR , PDALVAREZ@TECO.COM.AR , AOSCHUST@TECO.COM.AR`,

    subject: `Novedad: ${registro.novedad}`,
    html: generarHTMLEmail(registro)
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email enviado a ${registro.email}. Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`Error al enviar email a ${registro.email}:`, error);
    return false;
  }
}

// Función para generar HTML del email
function generarHTMLEmail(registro) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
        .btn { display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${registro.novedad}</h1>
        </div>
        <div class="content">
          ${registro.imagen ? `<img src="${registro.imagen}" alt="${registro.novedad}" style="max-width: 100%; height: auto;">` : ''}
          <p><strong>Descripción:</strong></p>
          <p>${registro.descripcion}</p>
          <p><strong>Fecha inicio:</strong> ${new Date(registro.fecha_inicio).toLocaleDateString('es-AR')}</p>
          <p><strong>Fecha fin:</strong> ${new Date(registro.fecha_fin).toLocaleDateString('es-AR')}</p>
          ${registro.link ? `<a href="${registro.link}" class="btn">Ver más información</a>` : ''}
        </div>
        <div class="footer">
          <p>Este es un mensaje automático del sistema de novedades.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Función para actualizar registro como enviado
async function actualizarEmailEnviado(id) {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    await connection.execute(
      'UPDATE pem_novedades SET email_enviado = 1 WHERE id = ?',
      [id]
    );
    console.log(`Registro ${id} actualizado como enviado.`);
  } catch (error) {
    console.error(`Error al actualizar registro ${id}:`, error);
    throw error;
  } finally {
    await connection.end();
  }
}

// Función principal que se ejecuta cada minuto
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
      console.log(`Procesando novedad ID: ${registro.id} - ${registro.novedad}`);
      
      const emailEnviado = await enviarEmail(registro);
      
      if (emailEnviado) {
        await actualizarEmailEnviado(registro.id);
      } else {
        console.log(`No se pudo enviar el email para el registro ${registro.id}`);
      }
    }
    
    console.log('Proceso completado.');
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
    
    return true;
  } catch (error) {
    console.error('✗ Error en la configuración:', error);
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
  
  // Programar ejecución cada 1 minuto
  cron.schedule('* * * * *', async () => {
    await procesarNovedades();
  });
  
  console.log('\n✓ Sistema iniciado. Verificación cada 1 minuto.');
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