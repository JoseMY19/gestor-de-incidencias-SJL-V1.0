const API_URL = 'http://localhost:3000/api';
let currentUser = null;
let mainMap, previewMap, previewMarker;
let chartTypeInstance = null;
let chartStatusInstance = null;

/* Inicializa la app */
function initApp() {
    setupNavigation();
    bindFormEvents();
    bindAuthEvents();
    initTheme(); // Modo oscuro

    // Verificar sesión
    const savedUser = localStorage.getItem('sjl_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showApp();
    } else {
        showLogin();
    }
}

/* --- UX: TOASTS --- */
function showToast(text, type = 'info') {
    let bg = "#3b82f6"; // info (blue)
    if (type === 'success') bg = "#22c55e"; // green
    if (type === 'error') bg = "#ef4444"; // red
    if (type === 'warning') bg = "#f59e0b"; // orange

    Toastify({
        text: text,
        duration: 3000,
        gravity: "top",
        position: "right",
        backgroundColor: bg,
        stopOnFocus: true
    }).showToast();
}

/* --- THEME --- */
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        document.getElementById('btnTheme').textContent = '☀️';
    }

    document.getElementById('btnTheme').addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        document.getElementById('btnTheme').textContent = isDark ? '☀️' : '🌙';
    });
}

/* --- AUTHENTICATION --- */
function bindAuthEvents() {
    // Login
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUser').value;
        const password = document.getElementById('loginPass').value;

        try {
            const res = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (res.ok) {
                loginUser(data);
                showToast(`Bienvenido, ${data.name}`, 'success');
            } else {
                showToast(data.error || 'Error al iniciar sesión', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Error de conexión', 'error');
        }
    });

    // Registrar
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('regName').value;
        const username = document.getElementById('regUser').value;
        const password = document.getElementById('regPass').value;

        try {
            const res = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, username, password })
            });
            const data = await res.json();

            if (res.ok) {
                showToast('Registro exitoso. Iniciando sesión...', 'success');
                loginUser(data);
            } else {
                showToast(data.error || 'Error al registrarse', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Error de conexión', 'error');
        }
    });

    // Cambiar vistas
    document.getElementById('linkRegister').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('login').classList.add('hidden');
        document.getElementById('register').classList.remove('hidden');
    });

    document.getElementById('linkLogin').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('register').classList.add('hidden');
        document.getElementById('login').classList.remove('hidden');
    });

    // Cerrar sesión
    document.getElementById('btnLogout').addEventListener('click', () => {
        if (confirm('¿Cerrar sesión?')) {
            logoutUser();
        }
    });
}

function loginUser(user) {
    currentUser = user;
    localStorage.setItem('sjl_user', JSON.stringify(user));
    document.getElementById('loginForm').reset();
    document.getElementById('registerForm').reset();
    showApp();
}

function logoutUser() {
    currentUser = null;
    localStorage.removeItem('sjl_user');
    showLogin();
}

function showLogin() {
    document.getElementById('mainNav').classList.add('hidden');
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById('login').classList.remove('hidden');
}

function showApp() {
    document.getElementById('mainNav').classList.remove('hidden');
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById('inicio').classList.remove('hidden');

    document.getElementById('welcomeMsg').textContent = `Hola, ${currentUser.name} (${currentUser.role === 'admin' ? 'Administrador' : 'Usuario'}). Bienvenido al gestor de incidencias.`;

    if (!mainMap) initMap();
    if (!previewMap) initMapPreview();
}

/* --- APP LOGIC --- */

function setupNavigation() {
    const btns = document.querySelectorAll('.nav-btn:not(#btnLogout):not(#btnTheme)');
    btns.forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById(b.dataset.view).classList.remove('hidden');
        btns.forEach(x => x.classList.remove('active'));
        b.classList.add('active');

        if (b.dataset.view === 'lista') displayIncidents();
        if (b.dataset.view === 'dashboard') renderDashboard();
        if (b.dataset.view === 'mapa' && mainMap) setTimeout(() => mainMap.invalidateSize(), 100);
        if (b.dataset.view === 'registrar' && previewMap) setTimeout(() => previewMap.invalidateSize(), 100);
    }));

    // Listeners for filters
    document.getElementById('filterSearch').addEventListener('input', () => displayIncidents());
    document.getElementById('filterType').addEventListener('change', () => displayIncidents());
    document.getElementById('filterStatus').addEventListener('change', () => displayIncidents());
    document.getElementById('filterDate').addEventListener('change', () => displayIncidents());

    document.getElementById('btnExport').addEventListener('click', exportToExcel);
}

function generateUniqueCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/* Ayudantes API */
async function fetchIncidents() {
    try {
        const res = await fetch(`${API_URL}/incidents`);
        return await res.json();
    } catch (e) {
        console.error('Error fetching incidents:', e);
        return [];
    }
}

/* Registro / Edición de incidencia */
let editingCode = null;

async function registerIncident(event, forcedStatus = null) {
    if (event) event.preventDefault();

    const form = document.getElementById('incidentForm');
    const formData = new FormData();

    // Campos básicos
    const name = document.getElementById('incidentName').value.trim();
    const type = document.getElementById('incidentType').value;
    const status = forcedStatus || document.getElementById('incidentStatus').value;
    const location = document.getElementById('incidentLocation').value.trim();
    const description = document.getElementById('incidentDescription').value.trim();
    const occurrenceTime = document.getElementById('incidentOccurrence').value;
    const reportedBy = document.getElementById('reportedBy').value.trim();
    const code = editingCode || document.getElementById('incidentCode').value || generateUniqueCode();

    // Validación
    if (name.length < 3) { showToast('Nombre muy corto', 'warning'); return; }
    if (!type) { showToast('Selecciona tipo', 'warning'); return; }
    if (!location) { showToast('Ingresa ubicación', 'warning'); return; }
    if (!reportedBy) { showToast('Ingresa quien reporta', 'warning'); return; }

    // Append to FormData
    formData.append('code', code);
    formData.append('name', name);
    formData.append('type', type);
    formData.append('status', status);
    formData.append('location', location);
    formData.append('reportedBy', reportedBy);
    if (description) formData.append('description', description);
    if (currentUser && currentUser.id) formData.append('userId', currentUser.id);

    formData.append('timestamp', new Date().toISOString());
    if (occurrenceTime) formData.append('occurrenceTime', occurrenceTime);

    const lat = document.getElementById('incidentLat').value;
    const lng = document.getElementById('incidentLng').value;
    if (lat) formData.append('lat', lat);
    if (lng) formData.append('lng', lng);

    const imageFile = document.getElementById('incidentImage').files[0];
    if (imageFile) {
        formData.append('image', imageFile);
    }

    try {
        const url = editingCode ? `${API_URL}/incidents/${editingCode}` : `${API_URL}/incidents`;
        const method = editingCode ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method: method,
            body: formData
        });

        if (res.ok) {
            showToast(editingCode ? 'Incidencia actualizada' : 'Incidencia registrada', 'success');
            resetForm();
            document.querySelector('[data-view="lista"]').click();
        } else {
            const err = await res.json();
            showToast('Error: ' + (err.error || 'Desconocido'), 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Error de conexión', 'error');
    }
}

function resetForm() {
    document.getElementById('incidentForm').reset();
    editingCode = null;
    document.getElementById('btnRegister').textContent = 'Registrar Incidencia';
    document.querySelector('#registrar h2').textContent = 'Nueva Incidencia';
    renderTimestamp();
    if (previewMarker) previewMap.removeLayer(previewMarker);
    previewMarker = null;
}

/* Mostrar lista */
async function displayIncidents() {
    let incidents = await fetchIncidents();

    // Filtrado
    const search = document.getElementById('filterSearch').value.toLowerCase();
    const type = document.getElementById('filterType').value;
    const status = document.getElementById('filterStatus').value;
    const date = document.getElementById('filterDate').value;

    incidents = incidents.filter(inc => {
        const matchSearch = !search ||
            inc.name.toLowerCase().includes(search) ||
            inc.code.toLowerCase().includes(search) ||
            inc.location.toLowerCase().includes(search);
        const matchType = !type || inc.type === type;
        const matchStatus = !status || inc.status === status;
        const matchDate = !date || inc.timestamp.startsWith(date) || (inc.occurrenceTime && inc.occurrenceTime.startsWith(date));

        return matchSearch && matchType && matchStatus && matchDate;
    });

    const tbody = document.getElementById('incidentList');
    tbody.innerHTML = '';

    if (incidents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2rem;">No hay incidencias registradas.</td></tr>';
        return;
    }

    incidents.forEach((inc) => {
        const tr = document.createElement('tr');

        const tdCode = document.createElement('td'); tdCode.textContent = inc.code; tr.appendChild(tdCode);

        const tdName = document.createElement('td');
        tdName.innerHTML = `<div>${inc.name}</div>`;
        if (inc.imageUrl) {
            const img = document.createElement('img');
            img.src = `http://localhost:3000${inc.imageUrl}`;
            img.style.height = '40px';
            img.style.borderRadius = '4px';
            img.style.marginTop = '4px';
            tdName.appendChild(img);
        }
        tr.appendChild(tdName);

        const tdType = document.createElement('td'); tdType.textContent = inc.type; tr.appendChild(tdType);

        const tdStatus = document.createElement('td');
        const span = document.createElement('span');
        span.className = `status-chip status-${inc.status.replace(/\s/g, '\\ ')}`;
        span.textContent = inc.status;
        tdStatus.appendChild(span);
        tr.appendChild(tdStatus);

        const tdLoc = document.createElement('td'); tdLoc.textContent = inc.location; tr.appendChild(tdLoc);

        const tdTime = document.createElement('td');
        const regDate = new Date(inc.timestamp).toLocaleString();
        const occDate = inc.occurrenceTime ? new Date(inc.occurrenceTime).toLocaleString() : '-';
        tdTime.innerHTML = `<small>Reg: ${regDate}<br>Suc: ${occDate}</small>`;
        tr.appendChild(tdTime);

        const tdReporter = document.createElement('td'); tdReporter.textContent = inc.reportedBy; tr.appendChild(tdReporter);

        const tdActions = document.createElement('td');

        const btnEdit = document.createElement('button');
        btnEdit.textContent = '✏️';
        btnEdit.title = 'Editar';
        btnEdit.className = 'action-btn action-edit';
        btnEdit.addEventListener('click', () => loadIncidentForEdit(inc));
        tdActions.appendChild(btnEdit);

        if (currentUser && (currentUser.role === 'admin' || (inc.userId && currentUser.id === inc.userId))) {
            const btnDelete = document.createElement('button');
            btnDelete.textContent = '🗑️';
            btnDelete.title = 'Eliminar';
            btnDelete.className = 'action-btn action-delete';
            btnDelete.addEventListener('click', () => deleteIncident(inc.code));
            tdActions.appendChild(btnDelete);
        }

        tr.appendChild(tdActions);
        tbody.appendChild(tr);
    });
}

function loadIncidentForEdit(inc) {
    editingCode = inc.code;

    document.getElementById('incidentName').value = inc.name;
    document.getElementById('incidentType').value = inc.type;
    document.getElementById('incidentStatus').value = inc.status;
    document.getElementById('incidentLocation').value = inc.location;
    document.getElementById('incidentDescription').value = inc.description || '';
    document.getElementById('reportedBy').value = inc.reportedBy;
    document.getElementById('incidentCode').value = inc.code;

    if (inc.occurrenceTime) {
        const dt = new Date(inc.occurrenceTime);
        dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
        document.getElementById('incidentOccurrence').value = dt.toISOString().slice(0, 16);
    }

    if (inc.lat && inc.lng) {
        document.getElementById('incidentLat').value = inc.lat;
        document.getElementById('incidentLng').value = inc.lng;
        if (previewMap) {
            const lat = parseFloat(inc.lat);
            const lng = parseFloat(inc.lng);
            if (previewMarker) previewMap.removeLayer(previewMarker);
            previewMarker = L.marker([lat, lng]).addTo(previewMap);
            previewMap.setView([lat, lng], 15);
        }
    }

    document.getElementById('btnRegister').textContent = 'Guardar Cambios';
    document.querySelector('#registrar h2').textContent = 'Editar Incidencia';
    document.querySelector('[data-view="registrar"]').click();
}

async function deleteIncident(code) {
    if (!confirm('¿Eliminar incidencia permanentemente?')) return;
    try {
        const res = await fetch(`${API_URL}/incidents/${code}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Incidencia eliminada', 'success');
            displayIncidents();
        } else {
            showToast('Error al eliminar', 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Error de conexión', 'error');
    }
}

/* --- DASHBOARD --- */
async function renderDashboard() {
    const incidents = await fetchIncidents();

    // Procesar datos
    const typeCount = {};
    const statusCount = {};

    incidents.forEach(i => {
        typeCount[i.type] = (typeCount[i.type] || 0) + 1;
        statusCount[i.status] = (statusCount[i.status] || 0) + 1;
    });

    // Renderizar Gráfico de Tipos
    const ctxType = document.getElementById('chartType').getContext('2d');
    if (chartTypeInstance) chartTypeInstance.destroy();
    chartTypeInstance = new Chart(ctxType, {
        type: 'doughnut',
        data: {
            labels: Object.keys(typeCount),
            datasets: [{
                data: Object.values(typeCount),
                backgroundColor: ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#64748b']
            }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } } }
    });

    // Renderizar Gráfico de Estados
    const ctxStatus = document.getElementById('chartStatus').getContext('2d');
    if (chartStatusInstance) chartStatusInstance.destroy();
    chartStatusInstance = new Chart(ctxStatus, {
        type: 'bar',
        data: {
            labels: Object.keys(statusCount),
            datasets: [{
                label: 'Cantidad',
                data: Object.values(statusCount),
                backgroundColor: ['#f59e0b', '#10b981', '#ef4444']
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { color: '#94a3b8' } },
                x: { ticks: { color: '#94a3b8' } }
            }
        }
    });
}

/* --- EXPORT --- */
async function exportToExcel() {
    const incidents = await fetchIncidents();
    if (incidents.length === 0) {
        showToast('No hay datos para exportar', 'warning');
        return;
    }

    const data = incidents.map(i => ({
        Codigo: i.code,
        Titulo: i.name,
        Tipo: i.type,
        Estado: i.status,
        Ubicacion: i.location,
        FechaRegistro: new Date(i.timestamp).toLocaleString(),
        FechaSuceso: i.occurrenceTime ? new Date(i.occurrenceTime).toLocaleString() : '',
        ReportadoPor: i.reportedBy
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Incidencias");
    XLSX.writeFile(wb, "Reporte_Incidencias.xlsx");
    showToast('Reporte descargado correctamente', 'success');
}

function renderTimestamp() {
    const ts = new Date();
    document.getElementById('incidentTimestamp').value = ts.toLocaleString();
    if (!editingCode) document.getElementById('incidentCode').value = generateUniqueCode();
}

function bindFormEvents() {
    document.getElementById('incidentForm').addEventListener('submit', (e) => registerIncident(e, null));
    document.getElementById('btnFinalize').addEventListener('click', () => registerIncident(null, 'Resuelta'));
    document.getElementById('btnCloseForm').addEventListener('click', () => {
        if (confirm('¿Cancelar?')) {
            resetForm();
            document.querySelector('[data-view="lista"]').click();
        }
    });
}

/* --MAPA PRINCIPAL- */
function initMap() {
    try {
        mainMap = L.map('map').setView([-12.02, -76.98], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        }).addTo(mainMap);

        const zones = {
            'Norte': { coords: [[-11.98, -76.99], [-11.98, -76.96], [-12.01, -76.96], [-12.01, -76.99]], color: '#2ecc71' },
            'Centro': { coords: [[-12.01, -76.99], [-12.01, -76.96], [-12.04, -76.96], [-12.04, -76.99]], color: '#f1c40f' },
            'Sur': { coords: [[-12.04, -76.99], [-12.04, -76.96], [-12.07, -76.96], [-12.07, -76.99]], color: '#3498db' }
        };

        Object.keys(zones).forEach(z => {
            const poly = L.polygon(zones[z].coords, { color: zones[z].color, weight: 1, fillOpacity: 0.12 }).addTo(mainMap);
            poly.bindPopup(`<strong>Zona ${z}</strong>`);
        });

    } catch (e) {
        console.error('Error inicializando mapa principal', e);
    }
}

/* --- MAPA PREVIEW --- */
async function reverseGeocode(lat, lng) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=es`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Respuesta no válida');
        const data = await res.json();
        return data.display_name || null;
    } catch (e) {
        return null;
    }
}

function initMapPreview() {
    try {
        previewMap = L.map('mapPreview').setView([-12.02, -76.98], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(previewMap);

        previewMap.on('click', async (e) => {
            const { lat, lng } = e.latlng;
            if (previewMarker) previewMap.removeLayer(previewMarker);
            previewMarker = L.marker([lat, lng]).addTo(previewMap);

            document.getElementById('incidentLat').value = lat.toFixed(6);
            document.getElementById('incidentLng').value = lng.toFixed(6);

            previewMarker.bindPopup('Buscando dirección...').openPopup();

            const address = await reverseGeocode(lat, lng);
            const locationInput = document.getElementById('incidentLocation');
            if (address) {
                locationInput.value = address;
                previewMarker.setPopupContent(address).openPopup();
            } else {
                const coordsText = `Coordenadas: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                locationInput.value = coordsText;
                previewMarker.setPopupContent(coordsText).openPopup();
            }
        });
    } catch (e) {
        console.error('Error inicializando mapa preview', e);
    }
}

window.addEventListener('load', initApp);