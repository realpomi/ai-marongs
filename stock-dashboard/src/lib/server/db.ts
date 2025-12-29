import postgres from 'postgres';
import { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } from '$env/static/private';

const connectionOptions = {
  host: DB_HOST || 'localhost',
  port: Number(DB_PORT || 5432),
  database: DB_NAME || 'stocks',
  user: DB_USER || 'stocks', // 'username' 대신 'user' 사용
  password: DB_PASSWORD || 'password',
};

console.log('Attempting DB connection with options:', {
  ...connectionOptions,
  password: connectionOptions.password ? '******' : undefined // 로그에 비밀번호 노출 방지
});

const sql = postgres(connectionOptions);

export default sql;
