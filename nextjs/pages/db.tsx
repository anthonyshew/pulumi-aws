import { PrismaClient } from "@prisma/client";

const DbCall = ({ allUsers }: { allUsers: any[] }) => {
  const makeNew = () => {
    fetch("/test-api/write-new-user", { method: "POST" })
      .then((res) => res.json())
      .then((res) => console.log(res));
  };

  return (
    <>
      <button onClick={() => makeNew()}>tryMakeNew</button>
      <p>do the thing </p>
      <pre>{JSON.stringify(allUsers, null, 2)}</pre>
    </>
  );
};

export default DbCall;

export const getStaticProps = async () => {
  console.log(process.env.DATABASE_URL);
  const prisma = new PrismaClient();
  const allUsers = await prisma.user.findMany();
  const removeDatesBecauseAnnoying = allUsers.map((user) => {
    const { createdAt, ...rest } = user;

    return rest;
  });
  return {
    props: {
      allUsers: removeDatesBecauseAnnoying,
    },
    revalidate: 5,
  };
};
