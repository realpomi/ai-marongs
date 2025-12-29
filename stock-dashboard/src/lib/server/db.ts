import postgres from 'postgres';
import { env } from '$env/dynamic/private';

const connectionOptions = {
  host: env.DB_HOST || 'localhost',
  port: Number(env.DB_PORT || 5432),
  database: env.DB_NAME || 'stocks',
  user: env.DB_USER || 'stocks',
  password: env.DB_PASSWORD || 'password',
};

console.log('Attempting DB connection with options:', {
  ...connectionOptions,
  password: connectionOptions.password ? '******' : undefined // 로그에 비밀번호 노출 방지
});

const sql = postgres(connectionOptions);

export default sql;
