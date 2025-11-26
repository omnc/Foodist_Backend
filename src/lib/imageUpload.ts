export async function uploadImage(
    file: File, 
    bucket: R2Bucket, 
    folder: string = 'images'
  ): Promise<string> {
    const ext = file.name.split('.').pop()
    const filename = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`
    
    await bucket.put(filename, file.stream(), {
      httpMetadata: { contentType: file.type }
    })
    
    return `https://pub-5834839887-foodist-images.r2.dev/${filename}`
  }