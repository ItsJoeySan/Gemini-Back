import "dotenv/config";

import express from "express";
import session from "express-session";
import cors from "cors";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { PrismaClient } from "@prisma/client";

const app = express();

const CLIENT_URL = "http://localhost:5173/";
const prisma = new PrismaClient();

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: process.env.AUTH_SECRET,
    resave: false,
    saveUninitialized: true,
    //cookie is use to store the session time, to decide when the session will expire
    //if cookie will not mention then session expire when we close the browser
    cookie: {
      //1sec * 60s * 60m * 1day
      expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
    },
  })
);

//initialize passport
app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/callback",
    },

    //here we are getting user data on profile
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await prisma.user.findFirst({
          where: { googleId: profile.id },
        });

        if (!user) {
          user = await prisma.user.create({
            data: {
              googleId: profile.id,
              email: profile.emails[0].value,
              name: profile.displayName,
              image: profile.photos[0].value,
            },
          });
        }
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

//we are using this so that when user logs in his user id store in the session
passport.serializeUser((user, done) => {
  return done(null, user.id);
});

//we are using this so that when we have to check if the user in the session is same as the user in db
passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
    });
    if (user) {
      return done(null, user);
    } else {
      return done(null, false);
    }
  } catch (error) {
    return done(error, null);
  }
});

//Route to initiate Google OAuth
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

//Google OAuth callback Route
app.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    successRedirect: CLIENT_URL,
    //if authentication failed we will redirect them to login route
    failureRedirect: "http://localhost:5173/login", //add a login route here
    failureFlash: true,
  })
);

app.get("/login/success", async (req, res) => {
  if (req.user) {
    res.status(200).json({
      success: true,
      message: "Successfull",
      user: req.user,
    });
  }
});

// app.get("/login/failed", async (req, res) => {
//   res.status(401).json({
//     success: false,
//     message: "failure",
//   });
// });

//this is where we will redirect when we click on "continue with google"
app.get("/logout", (req, res) => {
  req.logout();
  res.redirect(CLIENT_URL);
});

app.post("/user/post", async (req, res) => {
  // console.log("body: ", await req.isAuthenticated());
  if (req.isAuthenticated()) {
    console.log("Yes", req.body);
  }
  res.send("okay");
});

app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
