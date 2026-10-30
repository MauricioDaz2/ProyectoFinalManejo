document.getElementById('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const correo = document.getElementById('correo').value;
    const password = document.getElementById('password').value;
    const mensajeError = document.getElementById('mensajeError');

    mensajeError.textContent = '';

    try {
        
        const response = await fetch('http://localhost:3001/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ correo, password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            
            localStorage.setItem('usuario', JSON.stringify(data.usuario));

            
            const rolId = data.usuario.rolId;

            switch (rolId) {
                case 'R001': 
                    window.location.href = '../admin/dashboard.html';
                    break;
                case 'R002': 
                    window.location.href = '../cooperativa/dashboard_coop.html';
                    break;
                case 'R003':
                    window.location.href = '../oficinista/ventanilla_boletos.html';
                    break;
                case 'R004': 
                    window.location.href = '../controlador/escanner.html';
                    break;
                case 'R005': 
                    window.location.href = '../usuario/catalogo_viajes.html';
                    break;
                default:
                    mensajeError.textContent = "Rol de usuario no reconocido.";
            }
        } else {
            mensajeError.textContent = data.message || "Error al iniciar sesión.";
        }

    } catch (error) {
        console.error("Error de conexión:", error);
        mensajeError.textContent = "No se pudo conectar con el servidor backend.";
    }
});