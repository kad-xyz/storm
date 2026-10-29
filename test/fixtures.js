export const AUTH = `# Авторизация по паролю
source: MR !123, TASK-456
phase: 2

## flow
actor   Игрок
command Ввести логин и пароль
ui      Форма входа
system  API auth
event   Учётные данные проверены        @a1
policy  Когда проверены — выдать токены
event   Токены выданы                   @a2
hot     А если пароль неверный 5 раз?   @h1 →a2

## flow Ошибка входа ←a1
event   Вход отклонён
`
