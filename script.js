const apiKey = "d8501f8ce26cb77abb0793fa943c724c";

// DOM Elements
const cityInput = document.getElementById("cityInput");
const searchBtn = document.getElementById("searchBtn");
const locBtn = document.getElementById("locBtn");
const backBtn = document.getElementById("backBtn");
const weatherDisplaySection = document.getElementById("weatherDisplay");
const messageBox = document.getElementById("message");
const themeToggle = document.getElementById("themeToggle");
const suggestionsList = document.getElementById("suggestionsList");

const globePane = document.getElementById("globePane");
const mapPane = document.getElementById("mapPane");
const globeContainer = document.getElementById("globeContainer");

// Globe Variables
let scene, camera, renderer, globeMesh;
let rotationSpeed = 0.003;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

// Map Variables
let map;
let mapMarker;

// ====================================================================
//                             I. UI & State Management
// ====================================================================

const debounce = (func, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(null, args), delay);
    };
};

function displayMessage(text, type = 'loading') {
    messageBox.textContent = text;
    messageBox.className = `message-box ${type}`;
    messageBox.classList.remove('hidden');
    weatherDisplaySection.classList.add('hidden');
}

function clearMessage() {
    messageBox.classList.add('hidden');
    weatherDisplaySection.classList.remove('hidden');
}

function toggleView(showMap) {
    if (showMap) {
        globePane.classList.add('shifted');
        mapPane.classList.add('active');
        if (map) setTimeout(() => map.invalidateSize(true), 600);
    } else {
        globePane.classList.remove('shifted');
        mapPane.classList.remove('active');
    }
}

// --------------------------------------------------------------------
//                             II. THREE.JS GLOBE SETUP
// --------------------------------------------------------------------

function initGlobe() {
    scene = new THREE.Scene();

    const aspect = globeContainer.clientWidth / globeContainer.clientHeight;
    camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    camera.position.z = 2.5;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(globeContainer.clientWidth, globeContainer.clientHeight);
    globeContainer.appendChild(renderer.domElement);

    const globeGeometry = new THREE.SphereGeometry(1, 64, 64);
    const textureLoader = new THREE.TextureLoader();
    const mapTexture = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg');
    const bumpTexture = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_bump_2048.jpg');
    const specularTexture = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_specular_2048.jpg');

    const material = new THREE.MeshPhongMaterial({
        map: mapTexture,
        bumpMap: bumpTexture,
        bumpScale: 0.02,
        specularMap: specularTexture,
        specular: new THREE.Color('grey'),
        shininess: 8
    });

    globeMesh = new THREE.Mesh(globeGeometry, material);
    scene.add(globeMesh);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(5, 3, 5);
    scene.add(sunLight);

    document.getElementById('globeLoading').classList.add('hidden');
    animateGlobe();
}

function animateGlobe() {
    requestAnimationFrame(animateGlobe);
    if (!isDragging) globeMesh.rotation.y += rotationSpeed;
    renderer.render(scene, camera);
}

function onWindowResize() {
    const width = globeContainer.clientWidth;
    const height = globeContainer.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

// --------------------------------------------------------------------
//                             III. LEAFLET MAP SETUP
// --------------------------------------------------------------------

function updateMap(lat, lon, zoom = 13) {
    if (!map) {
        map = L.map('mapDisplay', { center: [lat, lon], zoom });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            
        }).addTo(map);
        mapMarker = L.marker([lat, lon]).addTo(map).bindPopup("Weather Location").openPopup();
    } else {
        map.setView([lat, lon], zoom);
        mapMarker.setLatLng([lat, lon]).openPopup();
    }
    map.invalidateSize(true);
}

// --------------------------------------------------------------------
//                             IV. WEATHER & AUTOCOMPLETE LOGIC
// --------------------------------------------------------------------

async function getCitySuggestions(query) {
    if (query.length < 3) {
        suggestionsList.classList.add('hidden');
        return;
    }

    try {
        const url = `https://api.openweathermap.org/geo/1.0/direct?q=${query}&limit=5&appid=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Geocoding API failed.');
        const data = await res.json();
        displaySuggestions(data);
    } catch (error) {
        console.error("Autocomplete error:", error);
        suggestionsList.classList.add('hidden');
    }
}

function displaySuggestions(cities) {
    suggestionsList.innerHTML = '';
    if (cities.length === 0) {
        suggestionsList.classList.add('hidden');
        return;
    }

    cities.forEach(city => {
        const li = document.createElement('li');
        const statePart = city.state ? `, ${city.state}` : '';
        li.textContent = `${city.name}, ${city.country}${statePart}`;
        li.dataset.lat = city.lat;
        li.dataset.lon = city.lon;

        li.addEventListener('click', (e) => {
            cityInput.value = e.target.textContent;
            const { lat, lon } = e.target.dataset;
            getWeather(`lat=${lat}&lon=${lon}`);
            suggestionsList.classList.add('hidden');
        });

        suggestionsList.appendChild(li);
    });

    suggestionsList.classList.remove('hidden');
}

function filterForecast(list) {
    const forecast = [];
    const today = new Date().toISOString().split('T')[0];

    const uniqueDates = list
        .map(item => item.dt_txt.split(' ')[0])
        .filter(date => date !== today)
        .reduce((dates, date) => {
            if (!dates.includes(date) && dates.length < 3) dates.push(date);
            return dates;
        }, []);

    uniqueDates.forEach(dateStr => {
        const dayEntries = list.filter(item => item.dt_txt.startsWith(dateStr));
        if (dayEntries.length > 0) {
            const noonEntry = dayEntries.reduce((prev, curr) => {
                const prevHour = new Date(prev.dt_txt).getHours();
                const currHour = new Date(curr.dt_txt).getHours();
                return Math.abs(currHour - 12) < Math.abs(prevHour - 12) ? curr : prev;
            });
            forecast.push(noonEntry);
        }
    });

    return forecast;
}

async function getWeather(query) {
    displayMessage(`Fetching weather data...`);
    try {
        const urlBase = "https://api.openweathermap.org/data/2.5/";
        const currentUrl = `${urlBase}weather?${query}&appid=${apiKey}&units=metric`;
        const forecastUrl = `${urlBase}forecast?${query}&appid=${apiKey}&units=metric`;

        const [currentRes, forecastRes] = await Promise.all([
            fetch(currentUrl),
            fetch(forecastUrl)
        ]);

        if (!currentRes.ok || !forecastRes.ok) throw new Error('City not found or API error.');

        const currentData = await currentRes.json();
        const forecastData = await forecastRes.json();

        const { lat, lon } = currentData.coord;
        updateMap(lat, lon);
        toggleView(true);

        displayCurrentWeather(currentData);
        const filteredForecast = filterForecast(forecastData.list);
        displayForecast(filteredForecast);
        clearMessage();

    } catch (error) {
        console.error("Weather data fetch error:", error);
        displayMessage(`Error: ${error.message}`, 'error');
        toggleView(false);
    }
}

function displayCurrentWeather(data) {
    const { name, sys, main, weather, wind } = data;
    const location = `${name}, ${sys.country}`;
    const temp = main.temp.toFixed(1);
    const description = weather[0].description.charAt(0).toUpperCase() + weather[0].description.slice(1);
    const iconUrl = `https://openweathermap.org/img/wn/${weather[0].icon}@2x.png`;

    const getWindDirection = (deg) => {
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        return directions[Math.round(deg / 45) % 8];
    };

    weatherDisplaySection.innerHTML = `
        <div class="current-weather">
            <div class="current-weather-icon">
                <img src="${iconUrl}" alt="${description}">
            </div>
            <div>
                <h3>${location}</h3>
                <p>${description} • ${temp}°C (Feels like: ${main.feels_like.toFixed(1)}°C)</p>
            </div>
        </div>
        
        <div class="details-grid">
            <div class="detail-item"><small>Humidity</small><strong>${main.humidity}%</strong></div>
            <div class="detail-item"><small>Wind</small><strong>${wind.speed.toFixed(1)} m/s (${getWindDirection(wind.deg)})</strong></div>
            <div class="detail-item"><small>Pressure</small><strong>${main.pressure} hPa</strong></div>
        </div>

        <h4 class="forecast-title">3-Day Forecast</h4>
        <div class="forecast-grid" id="forecastDiv"></div>
    `;
}

function displayForecast(days) {
    const forecastDiv = document.getElementById("forecastDiv");
    forecastDiv.innerHTML = "";

    days.forEach((day) => {
        const date = new Date(day.dt * 1000);
        const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
        const dayOfMonth = date.getDate();
        const iconUrl = `https://openweathermap.org/img/wn/${day.weather[0].icon}.png`;
        const temp = day.main.temp.toFixed(0);
        const humidity = day.main.humidity;
        const wind = day.wind.speed.toFixed(1);

        forecastDiv.innerHTML += `
            <div class="forecast-day">
                <small>${weekday} ${dayOfMonth}</small>
                <img src="${iconUrl}" alt="${day.weather[0].description}">
                <strong>${temp}°C</strong>
                <p class="forecast-detail">Hum: ${humidity}%</p>
                <p class="forecast-detail">Wind: ${wind} m/s</p>
            </div>
        `;
    });
}

// --------------------------------------------------------------------
//                             V. EVENT HANDLERS
// --------------------------------------------------------------------

function loadTheme() {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
        document.body.classList.add("light");
        themeToggle.textContent = "🌙";
    } else {
        document.body.classList.remove("light");
        themeToggle.textContent = "☀️";
    }
}

themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("light");
    const isLight = document.body.classList.contains("light");
    themeToggle.textContent = isLight ? "🌙" : "☀️";
    localStorage.setItem("theme", isLight ? "light" : "dark");
});

function handleSearch() {
    const city = cityInput.value.trim();
    if (city) getWeather(`q=${city}`);
    else displayMessage("Please enter a city name to search.", 'error');
    suggestionsList.classList.add('hidden');
}

searchBtn.addEventListener("click", handleSearch);
cityInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleSearch();
});

const debouncedSuggest = debounce((e) => {
    getCitySuggestions(e.target.value.trim());
}, 300);

cityInput.addEventListener("input", debouncedSuggest);

document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-wrap')) {
        suggestionsList.classList.add('hidden');
    }
});

locBtn.addEventListener('click', () => {
    displayMessage("Getting your location...");
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const { latitude, longitude } = position.coords;
            getWeather(`lat=${latitude}&lon=${longitude}`);
        }, () => {
            displayMessage("Could not get your location.", 'error');
            toggleView(false);
        });
    } else {
        displayMessage("Geolocation not supported.", 'error');
        toggleView(false);
    }
});

backBtn.addEventListener('click', () => {
    toggleView(false);
    weatherDisplaySection.classList.add('hidden');
});

function onMouseDown(event) {
    if (event.target === renderer.domElement) {
        isDragging = true;
        previousMousePosition.x = event.clientX;
        previousMousePosition.y = event.clientY;
        renderer.domElement.style.cursor = 'grabbing';
    }
}

function onMouseUp() {
    isDragging = false;
    renderer.domElement.style.cursor = 'grab';
}

function onMouseMove(event) {
    if (!isDragging) return;
    const deltaX = event.clientX - previousMousePosition.x;
    const deltaY = event.clientY - previousMousePosition.y;
    globeMesh.rotation.y += deltaX * 0.005;
    globeMesh.rotation.x += deltaY * 0.005;
    previousMousePosition.x = event.clientX;
    previousMousePosition.y = event.clientY;
}

// --------------------------------------------------------------------
//                             VI. INITIALIZATION
// --------------------------------------------------------------------

window.addEventListener('resize', onWindowResize, false);

document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    initGlobe();

    renderer.domElement.addEventListener('mousedown', onMouseDown, false);
    document.addEventListener('mouseup', onMouseUp, false);
    document.addEventListener('mousemove', onMouseMove, false);
    renderer.domElement.style.cursor = 'grab';

    updateMap(0, 0, 2);
    toggleView(false);
    weatherDisplaySection.classList.add('hidden');
});
