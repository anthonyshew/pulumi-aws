import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DbCall = ({ allUsers }: { allUsers: any[] }) => {
  const makeNew = () => {
    fetch("/test-api/write-new-user")
      .then((res) => res.json())
      .then((res) => console.log(res));
  };

  return (
    <>
      <button onClick={() => makeNew()}>tryMakeNew</button>
      <p>{allUsers}</p>
      <pre>{JSON.stringify(allUsers, null, 2)}</pre>
    </>
  );
};

export default DbCall;

export const getStaticProps = async () => {
  const allUsers = await prisma.user.findMany();
  console.log(process.env);
  return {
    props: {
      allUsers: process.env.DATABASE_URL,
    },
  };
};
