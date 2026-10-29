CREATE ROLE twake_tasks_owner LOGIN PASSWORD 'twake_tasks_owner';
CREATE ROLE twake_tasks LOGIN PASSWORD 'twake_tasks';
CREATE DATABASE twake_tasks OWNER twake_tasks_owner;
