import clsx from 'clsx'

const AppName = ({ className }: { className?: string }) => {
  return (
    <span className={clsx('text-base-content font-bold', className)}>
      Airacter
    </span>
  )
}

export default AppName
