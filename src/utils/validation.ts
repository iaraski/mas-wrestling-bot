export const validators = {
  // ФИО: три слова через пробел
  fullName: (text: string) => {
    const parts = text.trim().split(/\s+/);
    return parts.length === 3;
  },

  // Телефон: начинается с 8, ровно 11 цифр
  phone: (text: string) => {
    const digits = text.replace(/\D/g, '');
    return /^8\d{10}$/.test(digits);
  },

  // Email: базовая проверка
  email: (text: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
  },

  // Серия паспорта: 4 цифры
  passportSeries: (text: string) => {
    return /^\d{4}$/.test(text);
  },

  // Номер паспорта: 6 цифр
  passportNumber: (text: string) => {
    return /^\d{6}$/.test(text);
  },

  // Дата: ДД.ММ.ГГГГ (с ограничением от 1926 года до текущего момента)
  date: (text: string) => {
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(text)) return false;
    const [day, month, year] = text.split('.').map(Number);

    // Проверка на базовую корректность даты (например, не 31.02)
    const date = new Date(year, month - 1, day);
    const isValidDate =
      date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    if (!isValidDate) return false;

    // Ограничение по годам: не раньше 1926 и не в будущем
    const now = new Date();
    const minYear = 1926;

    return year >= minYear && date <= now;
  },
};
