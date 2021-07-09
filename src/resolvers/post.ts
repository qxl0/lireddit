import { Resolver, Query, Ctx, Arg, Int, Mutation, InputType, Field } from "type-graphql";
import { Post } from "../entities/Post";
import { MyContext } from "../types";


@InputType()
class PostInput {
    @Field()
    title: string
    @Field()
    text: string
}
@Resolver()
export class PostResolver {
    @Query(() => [Post])
    async posts(
        @Ctx() ctx: MyContext
    ) : Promise<Post[]>{
        //await sleep(3000);
        return Post.find();
    }

    @Query(() => Post, { nullable: true})
    post(
        @Arg('id', () => Int) id: number,
    ): Promise<Post | undefined>{
        return Post.findOne(id);
    }


    @Mutation(() => Post)
    async createPost(
        @Arg("input") input: PostInput,
        @Ctx() {req}: MyContext
    ): Promise<Post> {
        console.log("create post: ", req.session);
        if (!req.session.userId){
            throw new Error("not authenticated!")
        }
        return Post.create({
            ...input,
            creatorId: req.session.userId 
        }).save();
    }

    @Mutation(() => Post, {nullable: true })
    async updatePost(
        @Arg("id") id: number,
        @Arg("title", () => String, { nullable: true}) title: string,
    ): Promise<Post | null> {
        const post = await Post.findOne(id);
        if (!post) {
            return null;
        }
        if (typeof title !== 'undefined') {
            await Post.update({id}, {title});
        }
        return post;
    }
    @Mutation(() => Boolean) 
    async deletePost(
        @Arg("id") id: number,
    ): Promise<boolean> {
        await Post.delete(id);
        return true;
    }
}