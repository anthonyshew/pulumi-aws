import type { NextPage } from "next";
import Head from "next/head";
import { useState, useEffect } from "react";
import styles from "../styles/Home.module.css";

const useRequest = (path: string) => {
  useEffect(() => {
    fetch(path)
      .then((res) => res.json())
      .then((res) => console.log(path));
  }, []);
};

const Home: NextPage = () => {
  useRequest(`https://api/test-route`);
  useRequest(`https://api/another-api`);
  useRequest(`https://another-api/test-route`);
  useRequest(`https://another-api/test-route`);
  useRequest(`https://another-api`);
  useRequest(`https://another-api/`);

  useRequest(`https://api/test-route:5000`);
  useRequest(`https://api/another-api:5000`);
  useRequest(`https://another-api/test-route:5000`);
  useRequest(`https://another-api/test-route:5000`);
  useRequest(`https://another-api:5000`);
  useRequest(`https://another-api/:5000`);

  return (
    <div className={styles.container}>
      <Head>
        <title>Some Test Page</title>
        <meta name="description" content="Generated by create next app" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <p>Check the console.</p>
      </main>
    </div>
  );
};

export default Home;
