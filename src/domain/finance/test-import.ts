export async function runServerCode() {
  const uow = await import(/* @vite-ignore */ '../../db/uow');
  console.log(uow);
}
