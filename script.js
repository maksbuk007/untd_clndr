// URL ИЗ APPS SCRIPT
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby2nTctQppHT4oQz_lw58-h46HDJILrM85ULmFlic6n8D8N2138peCF57WzCdlYrUza/exec';

let currentDate = new Date();
let eventsData = [];

// Категории и их цвета (если админ пишет слово, а не HEX)
const categoryColors = {
    'планерка': '#0984e3',
    'молодежка': '#00b894',
    'важное': '#d63031',
    'праздник': '#fdcb6e',
    'встреча': '#6c5ce7'
};

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    fetchEvents();
    setupEventListeners();
});

// Загрузка данных
async function fetchEvents() {
    try {
        const response = await fetch(APPS_SCRIPT_URL);
        const rawData = await response.json();
        
        // Преобразуем "сырые" данные от Гугла в формат, понятный нашему календарю
        eventsData = rawData.map(event => {
            // 1. Фикс названия (понимает и "Название", и "Название события")
            const title = event['Название'] || event['Название события'] || 'Без названия';
            
            // 2. Фикс даты (переводит машинный формат "2026-09-14T21..." в "15.09.2026")
            let formattedDate = event['Дата'];
            if (formattedDate) {
                const d = new Date(formattedDate);
                // Проверяем, что дата корректная
                if (!isNaN(d.getTime())) {
                    const day = String(d.getDate()).padStart(2, '0');
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const year = d.getFullYear();
                    formattedDate = `${day}.${month}.${year}`;
                }
            }

            return {
                ...event, // Сохраняем остальные поля (Время, Описание, Цвет)
                'Название': title,
                'Дата': formattedDate
            };
        });

        renderCalendar();
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        document.getElementById('month-year').innerText = 'Ошибка загрузки';
    }
}

// Определение цвета
function getEventColor(colorInput) {
    if (!colorInput) return '#636e72';
    colorInput = colorInput.trim().toLowerCase();
    if (colorInput.startsWith('#')) return colorInput;
    return categoryColors[colorInput] || '#636e72';
}

// Отрисовка календаря
function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Заголовок месяца
    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    document.getElementById('month-year').innerText = `${monthNames[month]} ${year}`;
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Корректировка для начала недели с понедельника
    const startDay = firstDay === 0 ? 6 : firstDay - 1;
    
    // Пустые ячейки до первого числа
    for (let i = 0; i < startDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'day-cell empty';
        grid.appendChild(emptyCell);
    }
    
    const today = new Date();
    
    // Ячейки с днями
    for (let i = 1; i <= daysInMonth; i++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        
        // Проверка на "сегодня"
        if (i === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            cell.classList.add('today');
        }
        
        // Номер дня
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.innerText = i;
        cell.appendChild(dayNumber);
        
        // Фильтруем события для этого дня
        const dateString = `${String(i).padStart(2, '0')}.${String(month + 1).padStart(2, '0')}.${year}`;
        const dayEvents = eventsData.filter(e => e['Дата'] === dateString);
        
        if (dayEvents.length > 0) {
            const eventsContainer = document.createElement('div');
            eventsContainer.className = 'events-container';
            
            // Показываем максимум 2 события, чтобы не сломать сетку
            const maxVisible = window.innerWidth > 768 ? 2 : dayEvents.length;
            
            dayEvents.slice(0, maxVisible).forEach(event => {
                const pill = document.createElement('div');
                pill.className = 'event-pill';
                pill.style.backgroundColor = getEventColor(event['Цвет']);
                pill.innerText = event['Название'];
                eventsContainer.appendChild(pill);
            });
            
            cell.appendChild(eventsContainer);
            
            if (dayEvents.length > 2 && window.innerWidth > 768) {
                const more = document.createElement('div');
                more.className = 'more-events';
                more.innerText = `+${dayEvents.length - 2} еще`;
                cell.appendChild(more);
            }
            
            // Клик по ячейке открывает модалку
            cell.addEventListener('click', () => openModal(dateString, dayEvents));
        }
        
        grid.appendChild(cell);
    }
}

// Модальное окно
function openModal(dateStr, events) {
    document.getElementById('modal-date').innerText = `События: ${dateStr}`;
    const list = document.getElementById('modal-events-list');
    list.innerHTML = '';
    
    events.forEach(e => {
        const item = document.createElement('div');
        item.className = 'modal-event-item';
        item.style.backgroundColor = getEventColor(e['Цвет']);
        
        item.innerHTML = `
            <div class="modal-event-time">${e['Время'] || 'Весь день'}</div>
            <div class="modal-event-title">${e['Название']}</div>
            ${e['Описание'] ? `<div class="modal-event-desc">${e['Описание']}</div>` : ''}
        `;
        list.appendChild(item);
    });
    
    document.getElementById('modal').classList.remove('hidden');
}

// Обработчики кнопок
function setupEventListeners() {
    document.getElementById('prev-month').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });
    
    document.getElementById('next-month').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });
    
    document.getElementById('theme-toggle').addEventListener('click', () => {
        const html = document.documentElement;
        const newTheme = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        document.getElementById('theme-toggle').innerText = newTheme === 'light' ? '🌙' : '☀️';
    });
    
    document.getElementById('close-modal').addEventListener('click', () => {
        document.getElementById('modal').classList.add('hidden');
    });
    
    document.getElementById('modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modal')) {
            document.getElementById('modal').classList.add('hidden');
        }
    });

    // Перерисовка при изменении размера экрана (чтобы перестроить точки/текст)
    window.addEventListener('resize', renderCalendar);
}

// Инициализация темы
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.getElementById('theme-toggle').innerText = savedTheme === 'light' ? '🌙' : '☀️';
}
