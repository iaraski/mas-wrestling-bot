# Используем официальный образ Node.js
FROM node:20-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем файлы зависимостей
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходный код
COPY . .

# Собираем TypeScript проект
RUN npm run build

# Удаляем исходники и dev-зависимости для экономии места
RUN npm prune --production

# Команда для запуска бота
CMD ["node", "dist/bot.js"]
