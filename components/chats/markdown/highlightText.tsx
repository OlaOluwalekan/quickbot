// const highlightText = (text: string | ReactNode): ReactNode => {
//     if (!searchQuery || typeof text !== 'string') return text

//     const parts = text.split(new RegExp(`(${searchQuery})`, 'gi'))

//     return parts.map((part, i) =>
//       part.toLowerCase() === searchQuery ? (
//         <mark key={i} className='bg-lemon rounded'>
//           {part}
//         </mark>
//       ) : (
//         part
//       )
//     )
//   }

const highlightText = (text: string, search: string) => {
  if (!search || typeof text !== 'string') return text

  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')

  const parts = text.split(regex)

  return parts.map((part, i) =>
    part.toLowerCase() === search.toLowerCase() ? (
      <mark key={i} className='bg-lemon rounded'>
        {part}
      </mark>
    ) : (
      part
    )
  )
}

export default highlightText
