// import { PrismaClient } from "@prisma/client";
import { useState } from "react";

const DbCallerPage = ({ allUsers }: { allUsers: any[] }) => {
  const [nameInput, setNameInput] = useState("");

  const makeNew = () => {
    fetch("/test-api/write-new-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: nameInput }),
    })
      .then((res) => res.json())
      .then((res) => console.log(res));
  };

  return (
    <>
      <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
      <button onClick={() => makeNew()}>tryMakeNew</button>
      <p>This page refreshes its prerender every 5 seconds.</p>
      <p>
        Keep refreshing for up to 10 seconds to see if your database has been
        updated.
      </p>
      <pre>{JSON.stringify(allUsers, null, 2)}</pre>
    </>
  );
};

export default DbCallerPage;

export const getStaticProps = async () => {
  // console.log(process.env.DATABASE_URL);
  // const prisma = new PrismaClient();
  // const allUsers = await prisma.user.findMany();
  // const removeDatesBecauseAnnoying = allUsers.map((user) => {
  //   const { createdAt, ...rest } = user;

  // return rest;
  // });
  return {
    props: {
      // allUsers: removeDatesBecauseAnnoying,
      allUser: [],
    },
    revalidate: 5,
  };
};
